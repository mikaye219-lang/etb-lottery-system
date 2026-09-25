let selectedTicket = null;
let paymentId = null;

// ------------------------------------------
// LOAD TICKETS
// ------------------------------------------

async function loadTickets() {
  try {
    const response = await fetch("/api/status");
    const data = await response.json();

    if (!data.success) return;

    document.getElementById("players").textContent =
      data.approvedPlayers;

    document.getElementById("remaining").textContent =
      data.remaining;

    document.getElementById("progressText").textContent =
      `${data.approvedPlayers} / 60 approved`;

    document.getElementById("progress").style.width =
      `${data.progress}%`;

    renderTickets(
      data.availableTickets,
      data.takenTickets
    );

    // If the user's selected number became unavailable
    if (
      selectedTicket !== null &&
      !data.availableTickets.includes(selectedTicket)
    ) {
      selectedTicket = null;

      document.getElementById("selectedText").textContent =
        "Your selected number is no longer available. Please choose another number.";
    }

  } catch (error) {
    console.error("Ticket loading error:", error);
  }
}


// ------------------------------------------
// DISPLAY 1-60
// ------------------------------------------

function renderTickets(availableTickets, takenTickets) {

  const grid = document.getElementById("ticketGrid");

  grid.innerHTML = "";

  for (let number = 1; number <= 60; number++) {

    const button = document.createElement("button");

    button.className = "ticket-number";

    button.textContent = number;

    if (takenTickets.includes(number)) {

      button.disabled = true;

      button.classList.add("taken");

      button.title = "Already taken";

    } else {

      button.addEventListener("click", () => {
        chooseTicket(number);
      });

    }

    if (selectedTicket === number) {
      button.classList.add("selected");
    }

    grid.appendChild(button);
  }
}


// ------------------------------------------
// USER CHOOSES NUMBER
// ------------------------------------------

function chooseTicket(number) {

  selectedTicket = number;

  document.getElementById("selectedText").innerHTML =
    `✅ You selected ticket <strong>${number}</strong>`;

  document.querySelectorAll(".ticket-number").forEach(button => {

    button.classList.remove("selected");

    if (Number(button.textContent) === number) {
      button.classList.add("selected");
    }

  });
}


// ------------------------------------------
// SUBMIT PAYMENT
// ------------------------------------------

document
  .getElementById("paymentForm")
  .addEventListener("submit", async function(event) {

    event.preventDefault();

    if (selectedTicket === null) {

      showMessage(
        "❌ Please select a ticket number from 1 to 60 first.",
        "error"
      );

      return;
    }

    const userId =
      document.getElementById("userId").value.trim();

    const name =
      document.getElementById("name").value.trim();

    const phone =
      document.getElementById("phone").value.trim();

    const txid =
      document.getElementById("txid").value.trim();

    if (!userId || !name || !phone || !txid) {

      showMessage(
        "❌ Please fill in all fields.",
        "error"
      );

      return;
    }

    try {

      const response = await fetch(
        "/api/payment/submit",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            userId,
            name,
            phone,
            txid,
            selectedTicket
          })
        }
      );

      const data = await response.json();

      if (!data.success) {

        showMessage(
          `❌ ${data.message}`,
          "error"
        );

        await loadTickets();

        return;
      }

      paymentId = data.paymentId;

      showMessage(
        `✅ Payment submitted successfully.<br>
        Your requested ticket number is <strong>${selectedTicket}</strong>.<br>
        Waiting for admin approval.`,
        "success"
      );

      document.getElementById("statusCard")
        .classList.remove("hidden");

      document.getElementById("statusText").innerHTML =
        `Payment ID: <strong>${paymentId}</strong><br>
         Selected ticket: <strong>${selectedTicket}</strong><br>
         Status: <strong>PENDING</strong>`;

      startPaymentPolling();

    } catch (error) {

      console.error(error);

      showMessage(
        "❌ Could not connect to server.",
        "error"
      );
    }
  });


// ------------------------------------------
// CHECK PAYMENT STATUS
// ------------------------------------------

let pollingTimer = null;

function startPaymentPolling() {

  if (pollingTimer) {
    clearInterval(pollingTimer);
  }

  pollingTimer = setInterval(
    checkPaymentStatus,
    3000
  );

  checkPaymentStatus();
}


async function checkPaymentStatus() {

  if (!paymentId) return;

  try {

    const response = await fetch(
      `/api/payment/status/${paymentId}`
    );

    const data = await response.json();

    if (!data.success) return;

    const payment = data.payment;

    if (payment.status === "PENDING") {

      document.getElementById("statusText").innerHTML =
        `Payment ID: <strong>${payment.id}</strong><br>
         Selected ticket: <strong>${payment.selectedTicket}</strong><br>
         Status: ⏳ <strong>PENDING</strong><br>
         Waiting for admin approval.`;

    }


    if (payment.status === "APPROVED") {

      document.getElementById("statusText").innerHTML =
        `Payment ID: <strong>${payment.id}</strong><br>
         Status: ✅ <strong>APPROVED</strong>`;

      document.getElementById("ticketResult").innerHTML =
        `<div class="my-ticket">
          <span>Your Ticket Number</span>
          <strong>${payment.ticketNumber}</strong>
          <small>${payment.ticketId}</small>
        </div>`;

      if (pollingTimer) {
        clearInterval(pollingTimer);
      }

      selectedTicket = payment.ticketNumber;

      loadTickets();
    }


    if (payment.status === "REJECTED") {

      document.getElementById("statusText").innerHTML =
        `Payment ID: <strong>${payment.id}</strong><br>
         Status: ❌ <strong>REJECTED</strong><br>
         Reason: ${payment.rejectionReason || "No reason provided."}`;

      if (pollingTimer) {
        clearInterval(pollingTimer);
      }

      loadTickets();
    }

  } catch (error) {
    console.error(error);
  }
}


// ------------------------------------------
// MESSAGE
// ------------------------------------------

function showMessage(message, type) {

  const element =
    document.getElementById("message");

  element.innerHTML = message;

  element.className = type;
}


// ------------------------------------------
// WINNERS
// ------------------------------------------

async function loadLatestDraw() {

  try {

    const response =
      await fetch("/api/latest-draw");

    const data =
      await response.json();

    if (!data.success || !data.draw) {
      return;
    }

    const draw = data.draw;

    document
      .getElementById("winnerSection")
      .classList.remove("hidden");

    document.getElementById("winners").innerHTML = `

      <div class="winner">
        🥇 <strong>1ST</strong>
        <br>
        ${draw.winners.first.name}
        <br>
        Ticket ${draw.winners.first.ticketNumber}
        <br>
        <b>${draw.winners.first.prize} ETB</b>
      </div>

      <div class="winner">
        🥈 <strong>2ND</strong>
        <br>
        ${draw.winners.second.name}
        <br>
        Ticket ${draw.winners.second.ticketNumber}
        <br>
        <b>${draw.winners.second.prize} ETB</b>
      </div>

      <div class="winner">
        🥉 <strong>3RD</strong>
        <br>
        ${draw.winners.third.name}
        <br>
        Ticket ${draw.winners.third.ticketNumber}
        <br>
        <b>${draw.winners.third.prize} ETB</b>
      </div>

    `;

  } catch (error) {
    console.error(error);
  }
}


// ------------------------------------------
// START
// ------------------------------------------

loadTickets();

loadLatestDraw();

setInterval(loadTickets, 3000);