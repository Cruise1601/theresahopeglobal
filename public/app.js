const bookingPanel = document.getElementById("booking-panel");
const stepTitle = document.getElementById("step-title");
const stepDescription = document.getElementById("step-description");
const stepNumber = document.getElementById("step-number");
const stepContent = document.getElementById("step-content");
const backBtn = document.getElementById("back-btn");
const nextBtn = document.getElementById("next-btn");
const bookingNote = document.getElementById("booking-note");
const openBookingBtn = document.getElementById("open-booking");
const openBookingCtaBtn = document.getElementById("open-booking-cta");
const closeBookingBtn = document.getElementById("close-booking");

const state = {
  step: 1,
  services: [],
  selectedService: null,
  selectedDate: null,
  selectedTime: null,
  holdId: null,
  client: {
    name: "",
    email: "",
    phone: ""
  },
  reviewAgreed: false,
  appointment: null,
  calendar: {
    year: new Date().getFullYear(),
    month: new Date().getMonth()
  }
};

const steps = [
  {
    title: "Choose Your Service",
    description: "Select the service you need.",
    render: renderServiceSelection,
    canContinue: () => Boolean(state.selectedService)
  },
  {
    title: "Select Date",
    description: "Pick a date with available appointment times.",
    render: renderDateSelection,
    canContinue: () => Boolean(state.selectedDate)
  },
  {
    title: "Select Available Time",
    description: "Choose a slot and hold it while you finish booking.",
    render: renderTimeSelection,
    canContinue: () => Boolean(state.selectedTime)
  },
  {
    title: "Enter Your Details",
    description: "Tell us how to reach you for confirmation.",
    render: renderDetailsForm,
    canContinue: () => Boolean(state.client.name && state.client.email && state.client.phone)
  },
  {
    title: "Review Booking",
    description: "Confirm the appointment details before payment.",
    render: renderReview,
    canContinue: () => true
  },
  {
    title: "Make Payment",
    description: "Complete the payment to confirm your appointment.",
    render: renderPayment,
    canContinue: () => true
  }
];

async function fetchServices() {
  const response = await fetch("/api/services");
  const data = await response.json();
  state.services = data;
}

function openBooking() {
  bookingPanel.classList.remove("hidden");
  renderStep();
}

function closeBooking() {
  bookingPanel.classList.add("hidden");
  if (state.holdId) {
    fetch("/api/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdId: state.holdId })
    });
    state.holdId = null;
  }
}

function setStep(step) {
  state.step = step;
  renderStep();
}

function renderStep() {
  const step = steps[state.step - 1];
  stepTitle.textContent = step.title;
  stepDescription.textContent = step.description;
  stepNumber.textContent = state.step;
  stepContent.innerHTML = "";
  bookingNote.textContent = "";
  backBtn.disabled = state.step === 1;
  nextBtn.textContent = state.step === steps.length ? "Confirm Payment" : "Continue";
  step.render();
}

function toggleNextButton() {
  const step = steps[state.step - 1];
  nextBtn.disabled = !step.canContinue();
}

function renderServiceSelection() {
  const list = document.createElement("div");
  list.className = "service-list";

  state.services.forEach((service) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `service-card ${state.selectedService?.id === service.id ? "selected" : ""}`;
    card.innerHTML = `
      <div class="service-title">${service.name}</div>
      <p class="service-meta">${service.description}</p>
      <p class="service-meta">$${service.price} USD • ${service.duration} minutes</p>
    `;
    card.addEventListener("click", () => {
      state.selectedService = service;
      state.selectedDate = null;
      state.selectedTime = null;
      state.holdId = null;
      renderStep();
      toggleNextButton();
    });
    list.appendChild(card);
  });

  stepContent.appendChild(list);
  toggleNextButton();
}

function renderDateSelection() {
  const container = document.createElement("div");
  container.className = "calendar-picker";

  const header = document.createElement("div");
  header.className = "calendar-header-picker";

  const monthLabel = document.createElement("h3");
  monthLabel.textContent = new Date(state.calendar.year, state.calendar.month).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });

  const controls = document.createElement("div");
  controls.style.display = "flex";
  controls.style.gap = "0.75rem";

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "secondary-button";
  prevBtn.textContent = "<";
  prevBtn.addEventListener("click", () => {
    const date = new Date(state.calendar.year, state.calendar.month - 1, 1);
    state.calendar.year = date.getFullYear();
    state.calendar.month = date.getMonth();
    renderStep();
  });

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "secondary-button";
  nextBtn.textContent = ">";
  nextBtn.addEventListener("click", () => {
    const date = new Date(state.calendar.year, state.calendar.month + 1, 1);
    state.calendar.year = date.getFullYear();
    state.calendar.month = date.getMonth();
    renderStep();
  });

  controls.append(prevBtn, nextBtn);
  header.append(monthLabel, controls);

  const dayLabels = document.createElement("div");
  dayLabels.className = "day-labels";
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((label) => {
    const cell = document.createElement("div");
    cell.textContent = label;
    dayLabels.appendChild(cell);
  });

  const grid = document.createElement("div");
  grid.className = "calendar-grid";

  fetch(`/api/calendar?year=${state.calendar.year}&month=${state.calendar.month}`)
    .then((response) => response.json())
    .then((data) => {
      data.grid.forEach((week) => {
        week.forEach((day) => {
          const cell = document.createElement("button");
          cell.type = "button";
          if (!day) {
            cell.className = "day-cell unavailable";
            cell.disabled = true;
            cell.textContent = "";
          } else {
            const status = day.status === "available" ? "available" : day.status === "fullyBooked" ? "booked" : "unavailable";
            cell.className = `day-cell ${status}`;
            cell.innerHTML = `<span>${day.day}</span>`;
            if (status === "available") {
              cell.addEventListener("click", () => {
                state.selectedDate = new Date(day.date).toISOString().slice(0, 10);
                state.selectedTime = null;
                state.holdId = null;
                renderStep();
                toggleNextButton();
              });
            } else {
              cell.disabled = true;
            }
            if (state.selectedDate === day.date) {
              cell.classList.add("selected");
            }
          }
          grid.appendChild(cell);
        });
      });
    })
    .catch(() => {
      bookingNote.textContent = "Unable to load the calendar. Please try again.";
    });

  container.append(header, dayLabels, grid);
  stepContent.appendChild(container);
  toggleNextButton();
}

function renderTimeSelection() {
  const wrapper = document.createElement("div");
  wrapper.className = "timeslot-list";

  stepContent.textContent = "Loading available times...";
  fetch(`/api/timeslots?serviceId=${state.selectedService.id}&date=${state.selectedDate}`)
    .then((response) => response.json())
    .then((data) => {
      wrapper.innerHTML = "";
      data.slots.forEach((slot) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = `timeslot-card ${slot.status}`;
        card.disabled = slot.status === "booked";
        card.innerHTML = `
          <div class="timeslot-heading">${slot.label}</div>
          <p class="slot-meta">${slot.status === "available" ? "Available" : "Booked"}</p>
        `;
        if (slot.status === "available") {
          card.addEventListener("click", async () => {
            try {
              const holdResponse = await fetch("/api/hold", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ serviceId: state.selectedService.id, date: state.selectedDate, time: slot.time })
              });
              const holdData = await holdResponse.json();
              if (!holdResponse.ok) {
                throw new Error(holdData.error || "Unable to reserve this time slot.");
              }
              state.selectedTime = slot.time;
              state.holdId = holdData.holdId;
              renderStep();
              toggleNextButton();
            } catch (error) {
              bookingNote.textContent = error.message;
            }
          });
        }
        if (state.selectedTime === slot.time) {
          card.classList.add("selected");
        }
        wrapper.appendChild(card);
      });
      stepContent.innerHTML = "";
      stepContent.appendChild(wrapper);
      toggleNextButton();
    })
    .catch(() => {
      stepContent.textContent = "Unable to load time slots. Please try again.";
    });
}

function renderDetailsForm() {
  const form = document.createElement("div");
  form.className = "form-grid";

  const nameGroup = createInputField("Name", "name", state.client.name);
  const emailGroup = createInputField("Email", "email", state.client.email, "email");
  const phoneGroup = createInputField("Phone", "phone", state.client.phone, "tel");

  form.append(nameGroup, emailGroup, phoneGroup);
  stepContent.appendChild(form);
  toggleNextButton();
}

function createInputField(labelText, name, value = "", type = "text") {
  const group = document.createElement("div");
  group.className = "detail-card";
  const label = document.createElement("label");
  label.textContent = labelText;
  label.htmlFor = name;
  const input = document.createElement("input");
  input.id = name;
  input.name = name;
  input.type = type;
  input.value = value;
  input.className = "input-field";
  input.addEventListener("input", (event) => {
    state.client[name] = event.target.value;
    toggleNextButton();
  });

  group.append(label, input);
  return group;
}

function renderReview() {
  const review = document.createElement("div");
  review.className = "review-details";

  const details = [
    ["Service", state.selectedService.name],
    ["Price", `$${state.selectedService.price} USD`],
    ["Duration", `${state.selectedService.duration} minutes`],
    ["Date", state.selectedDate],
    ["Time", formatTimeLabel(state.selectedTime)],
    ["Client", state.client.name],
    ["Email", state.client.email],
    ["Phone", state.client.phone]
  ];

  details.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "detail-card";
    item.innerHTML = `<strong>${label}</strong><p>${value}</p>`;
    review.appendChild(item);
  });

  const note = document.createElement("p");
  note.className = "booking-note";
  note.textContent = "The selected slot is held temporarily while you complete your booking. Please confirm payment to secure it permanently.";
  stepContent.appendChild(review);
  stepContent.appendChild(note);
  toggleNextButton();
}

function renderPayment() {
  const paymentCard = document.createElement("div");
  paymentCard.className = "confirmation-card";
  paymentCard.innerHTML = `
    <h3>Confirm and pay ${state.selectedService.price} USD</h3>
    <p>Once the payment is completed, your appointment will be confirmed and the slot removed from availability.</p>
  `;
  stepContent.appendChild(paymentCard);
  toggleNextButton();
}

function formatTimeLabel(time) {
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

async function submitBooking() {
  if (!state.holdId) {
    bookingNote.textContent = "Your selected time slot could not be held. Please try again.";
    return;
  }

  nextBtn.disabled = true;
  bookingNote.textContent = "Finalizing payment and confirming your appointment...";

  try {
    const response = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdId: state.holdId, client: state.client })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Unable to complete booking.");
    }
    state.appointment = data.appointment;
    showConfirmation();
  } catch (error) {
    bookingNote.textContent = error.message;
    nextBtn.disabled = false;
  }
}

function showConfirmation() {
  state.step = steps.length + 1;
  stepTitle.textContent = "Appointment Confirmed";
  stepDescription.textContent = "Your appointment is booked and confirmed.";
  stepNumber.textContent = "✓";
  backBtn.disabled = true;
  nextBtn.classList.add("hidden");
  stepContent.innerHTML = "";

  const card = document.createElement("div");
  card.className = "confirmation-card";
  card.innerHTML = `
    <h3>✅ Appointment Confirmed</h3>
    <p class="badge">Reference ${state.appointment.reference}</p>
    <div class="summary-row"><span>Service</span><strong>${state.appointment.serviceName}</strong></div>
    <div class="summary-row"><span>Date</span><strong>${state.appointment.date}</strong></div>
    <div class="summary-row"><span>Time</span><strong>${formatTimeLabel(state.appointment.time)}</strong></div>
    <div class="summary-row"><span>Duration</span><strong>${state.appointment.duration} minutes</strong></div>
    <div class="summary-row"><span>Payment status</span><strong>${state.appointment.paymentStatus}</strong></div>
    <div class="summary-row"><span>Client</span><strong>${state.appointment.client.name}</strong></div>
    <p>If you need to reschedule or cancel, please contact TheresaHopeGlobal with your reference number.</p>
  `;

  stepContent.appendChild(card);
  bookingNote.textContent = "Thank you! Your appointment is now confirmed.";
}

openBookingBtn?.addEventListener("click", openBooking);
openBookingCtaBtn?.addEventListener("click", openBooking);
closeBookingBtn?.addEventListener("click", closeBooking);
backBtn.addEventListener("click", () => {
  if (state.step === 1) return;
  if (state.step === 6) {
    state.step = 5;
  } else {
    state.step -= 1;
  }
  renderStep();
});
nextBtn.addEventListener("click", async () => {
  if (state.step === steps.length) {
    await submitBooking();
    return;
  }
  if (state.step === 3 && !state.selectedTime) {
    bookingNote.textContent = "Please choose an available time slot.";
    return;
  }

  state.step += 1;
  renderStep();
});

fetchServices().then(() => {});
