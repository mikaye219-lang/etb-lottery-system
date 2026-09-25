let allPayments = [];
let currentPaymentFilter = "ALL";

let selectedAdminTicket = null;

// =====================================================
// HELPERS
// =====================================================

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(date) {
  if (!date) return "-";

  return new Date(date).toLocaleString();
}

// =====================================================
// LOAD EVERYTHING
// =====================================================

async function loadEverything() {
  await loadStatus();
  await loadPayments();
  await loadHistory();
  await loadUsers();
  await loadBalanceTransactions();
}

// =====================================================
// LOAD STATUS
// =====================================================

async function loadStatus() {

  try {

    const response =
      await fetch("/api/status");

    const data =
      await response.json();

    if (!data.success) {
      throw new Error(data.message);
    }

    document.getElementById("roundNumber")
      .textContent = data.round;

    document.getElementById("filledCount")
      .textContent =
      `${data.approvedPlayers} / 60`;

    document.getElementById("remainingCount")
      .textContent = data.remaining;

    document.getElementById("progressPercent")
      .textContent =
      `${data.progress}%`;

    document.getElementById("progressBar")
      .style.width =
      `${data.progress}%`;

    document.getElementById("lotteryMessage")
      .textContent =
      data.approvedPlayers === 60
        ? "Lottery is full. Drawing..."
        : `${data.remaining} numbers remaining.`;

    renderAdminTicketGrid(
      data.availableTickets,
      data.reservedTickets
    );

    renderCurrentTicketGrid(
      data.takenTickets,
      data.reservedTickets
    );

    renderPlayers(data.players);

  } catch (error) {

    console.error(error);

    document.getElementById("lotteryMessage")
      .textContent =
      "Unable to load lottery status.";
  }
}

// =====================================================
// ADMIN TICKET GRID
// =====================================================

function renderAdminTicketGrid(
  availableTickets,
  reservedTickets
) {

  const grid =
    document.getElementById(
      "adminTicketGrid"
    );

  const available =
    new Set(availableTickets);

  const reserved =
    new Set(reservedTickets);

  let html = "";

  for (let number = 1; number <= 60; number++) {

    let className = "ticket-button";

    if (available.has(number)) {
      className += " available";
    } else if (reserved.has(number)) {
      className += " reserved";
    } else {
      className += " taken";
    }

    const disabled =
      !available.has(number)
        ? "disabled"
        : "";

    html += `
      <button
        class="${className}"
        ${disabled}
        onclick="selectAdminTicket(${number})"
      >
        ${number}
      </button>
    `;
  }

  grid.innerHTML = html;
}

// =====================================================
// SELECT ADMIN NUMBER
// =====================================================

function selectAdminTicket(number) {

  selectedAdminTicket = number;

  document.getElementById(
    "selectedAdminTicket"
  ).textContent = number;

  document.getElementById(
    "assignTicketButton"
  ).disabled = false;

  document.querySelectorAll(
    "#adminTicketGrid .ticket-button"
  ).forEach(button => {

    button.classList.remove(
      "selected"
    );

    if (
      Number(button.textContent.trim()) ===
      number
    ) {
      button.classList.add(
        "selected"
      );
    }
  });
}

// =====================================================
// ADMIN ASSIGN NUMBER
// =====================================================

async function assignAdminTicket() {

  if (!selectedAdminTicket) {
    alert("Please select a ticket number.");
    return;
  }

  const name =
    document.getElementById(
      "adminName"
    ).value.trim();

  const phone =
    document.getElementById(
      "adminPhone"
    ).value.trim();

  if (!name) {
    alert("Please enter the name.");
    return;
  }

  if (!phone) {
    alert("Please enter the phone.");
    return;
  }

  const confirmed =
    confirm(
      `Assign ticket number ${selectedAdminTicket} to ${name}?`
    );

  if (!confirmed) {
    return;
  }

  try {

    const response =
      await fetch(
        "/api/admin/assign-ticket",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            name,
            phone,
            ticketNumber:
              selectedAdminTicket
          })
        }
      );

    const data =
      await response.json();

    if (!data.success) {
      alert(data.message);
      return;
    }

    alert(
      `Ticket ${selectedAdminTicket} assigned successfully.`
    );

    document.getElementById(
      "adminName"
    ).value = "";

    document.getElementById(
      "adminPhone"
    ).value = "";

    selectedAdminTicket = null;

    document.getElementById(
      "selectedAdminTicket"
    ).textContent = "None";

    document.getElementById(
      "assignTicketButton"
    ).disabled = true;

    await loadStatus();
    await loadPayments();
    await loadHistory();

    // If 60/60 was reached, show draw.
    if (data.draw) {
      showDraw(data.draw);
    }

  } catch (error) {

    console.error(error);

    alert(
      "Server error while assigning ticket."
    );
  }
}

// =====================================================
// CURRENT TICKET GRID
// =====================================================

function renderCurrentTicketGrid(
  takenTickets,
  reservedTickets
) {

  const grid =
    document.getElementById(
      "currentTicketGrid"
    );

  const taken =
    new Set(takenTickets);

  const reserved =
    new Set(reservedTickets);

  let html = "";

  for (let number = 1; number <= 60; number++) {

    let className =
      "ticket-button";

    let text = number;

    if (taken.has(number)) {

      className += " taken";

      text = `${number} ✓`;

    } else if (reserved.has(number)) {

      className += " reserved";

      text = `${number} ⏳`;

    } else {

      className += " available";

      text = `${number}`;
    }

    html += `
      <div class="${className}">
        ${text}
      </div>
    `;
  }

  grid.innerHTML = html;
}

// =====================================================
// PLAYERS
// =====================================================

function renderPlayers(players) {

  const container =
    document.getElementById(
      "playersContainer"
    );

  if (!players || players.length === 0) {

    container.innerHTML =
      `<div class="empty">
        No tickets assigned yet.
      </div>`;

    return;
  }

  let html = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Phone</th>
            <th>Ticket</th>
            <th>Type</th>
            <th>Ticket ID</th>
          </tr>
        </thead>
        <tbody>
  `;

  players
    .sort(
      (a, b) =>
        Number(a.ticketNumber) -
        Number(b.ticketNumber)
    )
    .forEach((player, index) => {

      html += `
        <tr>
          <td>${index + 1}</td>

          <td>
            ${escapeHTML(player.name)}
          </td>

          <td>
            ${escapeHTML(player.phone)}
          </td>

          <td>
            <strong>
              ${player.ticketNumber}
            </strong>
          </td>

          <td>
            ${player.source === "ADMIN"
              ? "ADMIN"
              : "USER"}
          </td>

          <td>
            ${escapeHTML(player.ticketId)}
          </td>
        </tr>
      `;
    });

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
}

// =====================================================
// PAYMENTS
// =====================================================

async function loadPayments() {

  try {

    const response =
      await fetch(
        "/api/admin/payments"
      );

    const data =
      await response.json();

    if (!data.success) {
      throw new Error(data.message);
    }

    allPayments =
      data.payments || [];

    renderPayments();

  } catch (error) {

    console.error(error);

    document.getElementById(
      "paymentsContainer"
    ).innerHTML =
      `<div class="error">
        Unable to load payments.
      </div>`;
  }
}

// =====================================================
// FILTER PAYMENTS
// =====================================================

function filterPayments(status) {

  currentPaymentFilter = status;

  renderPayments();
}

// =====================================================
// RENDER PAYMENTS
// =====================================================

function renderPayments() {

  const container =
    document.getElementById(
      "paymentsContainer"
    );

  let payments =
    allPayments;

  if (currentPaymentFilter !== "ALL") {

    payments =
      allPayments.filter(
        p =>
          p.status ===
          currentPaymentFilter
      );
  }

  if (!payments.length) {

    container.innerHTML =
      `<div class="empty">
        No ${currentPaymentFilter === "ALL"
          ? ""
          : currentPaymentFilter.toLowerCase()
        } payment requests.
      </div>`;

    return;
  }

  let html = "";

  payments.forEach(payment => {

    const statusClass =
      payment.status.toLowerCase();

    html += `
      <div class="payment-card">

        <div class="payment-main">

          <h3>
            ${escapeHTML(payment.name)}
          </h3>

          <p>
            📱 ${escapeHTML(payment.phone)}
          </p>

          <p>
            💳 TXID:
            <strong>
              ${escapeHTML(payment.txid)}
            </strong>
          </p>

          <p>
            🎟️ Requested number:
            <strong class="requested-number">
              ${payment.selectedTicket}
            </strong>
          </p>

          <p>
            💰 Amount:
            ${payment.amount} ETB
          </p>

          <p>
            🕐 ${formatDate(payment.createdAt)}
          </p>

        </div>

        <div class="payment-status">

          <span class="status ${statusClass}">
            ${payment.status}
          </span>

          ${
            payment.status === "APPROVED"
              ? `
                <p>
                  Official ticket:
                  <strong>
                    ${payment.ticketNumber}
                  </strong>
                </p>
              `
              : ""
          }

          ${
            payment.status === "REJECTED"
              ? `
                <p class="reject-reason">
                  ${escapeHTML(
                    payment.rejectionReason
                  )}
                </p>
              `
              : ""
          }

        </div>

        ${
          payment.status === "PENDING"
            ? `
              <div class="payment-actions">

                <button
                  class="approve-button"
                  onclick="approvePayment('${payment.id}')"
                >
                  ✓ Approve
                </button>

                <button
                  class="reject-button"
                  onclick="rejectPayment('${payment.id}')"
                >
                  ✕ Reject
                </button>

              </div>
            `
            : ""
        }

      </div>
    `;
  });

  container.innerHTML = html;
}

// =====================================================
// APPROVE PAYMENT
// =====================================================

async function approvePayment(paymentId) {

  const payment =
    allPayments.find(
      p => p.id === paymentId
    );

  if (!payment) return;

  const confirmed =
    confirm(
      `Approve payment and give ticket ${payment.selectedTicket} to ${payment.name}?`
    );

  if (!confirmed) {
    return;
  }

  try {

    const response =
      await fetch(
        `/api/admin/payment/${paymentId}/approve`,
        {
          method: "POST"
        }
      );

    const data =
      await response.json();

    if (!data.success) {
      alert(data.message);
      return;
    }

    alert(
      `Approved. ${payment.name} now officially has ticket ${payment.selectedTicket}.`
    );

    await loadEverything();

    if (data.draw) {
      showDraw(data.draw);
    }

  } catch (error) {

    console.error(error);

    alert(
      "Unable to approve payment."
    );
  }
}

// =====================================================
// REJECT PAYMENT
// =====================================================

async function rejectPayment(paymentId) {

  const reason =
    prompt(
      "Enter rejection reason:"
    );

  if (reason === null) {
    return;
  }

  try {

    const response =
      await fetch(
        `/api/admin/payment/${paymentId}/reject`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            reason:
              reason.trim() ||
              "Payment rejected by admin."
          })
        }
      );

    const data =
      await response.json();

    if (!data.success) {
      alert(data.message);
      return;
    }

    alert(
      "Payment rejected. The requested ticket is available again."
    );

    await loadEverything();

  } catch (error) {

    console.error(error);

    alert(
      "Unable to reject payment."
    );
  }
}

// =====================================================
// SHOW DRAW
// =====================================================

function showDraw(draw) {

  if (!draw) return;

  const message = `
LOTTERY DRAW COMPLETE!

🥇 1st:
${draw.first.name}
Ticket ${draw.first.ticketNumber}
${draw.first.prize} ETB

🥈 2nd:
${draw.second.name}
Ticket ${draw.second.ticketNumber}
${draw.second.prize} ETB

🥉 3rd:
${draw.third.name}
Ticket ${draw.third.ticketNumber}
${draw.third.prize} ETB
  `;

  alert(message);
}

// =====================================================
// LATEST DRAW
// =====================================================

async function loadLatestDraw() {

  try {

    const response =
      await fetch(
        "/api/latest-draw"
      );

    const data =
      await response.json();

    const container =
      document.getElementById(
        "latestWinner"
      );

    if (!data.draw) {

      container.innerHTML =
        "No draw yet.";

      return;
    }

    const draw = data.draw;

    container.innerHTML = `
      <div class="winner-grid">

        <div class="winner first">
          <span>🥇 FIRST</span>
          <strong>
            ${escapeHTML(draw.first.name)}
          </strong>
          <p>
            Ticket ${draw.first.ticketNumber}
          </p>
          <b>
            ${draw.first.prize} ETB
          </b>
        </div>

        <div class="winner second">
          <span>🥈 SECOND</span>
          <strong>
            ${escapeHTML(draw.second.name)}
          </strong>
          <p>
            Ticket ${draw.second.ticketNumber}
          </p>
          <b>
            ${draw.second.prize} ETB
          </b>
        </div>

        <div class="winner third">
          <span>🥉 THIRD</span>
          <strong>
            ${escapeHTML(draw.third.name)}
          </strong>
          <p>
            Ticket ${draw.third.ticketNumber}
          </p>
          <b>
            ${draw.third.prize} ETB
          </b>
        </div>

      </div>
    `;

  } catch (error) {

    console.error(error);
  }
}

// =====================================================
// HISTORY
// =====================================================

async function loadHistory() {

  try {

    const response =
      await fetch(
        "/api/history"
      );

    const data =
      await response.json();

    const container =
      document.getElementById(
        "historyContainer"
      );

    if (
      !data.history ||
      !data.history.length
    ) {

      container.innerHTML =
        `<div class="empty">
          No draw history yet.
        </div>`;

      await loadLatestDraw();

      return;
    }

    let html = "";

    data.history.forEach(draw => {

      html += `
        <div class="history-card">

          <h3>
            Round ${draw.round}
          </h3>

          <p>
            ${formatDate(draw.date)}
          </p>

          <div class="history-winners">

            <div>
              🥇
              ${escapeHTML(draw.first.name)}
              —
              Ticket ${draw.first.ticketNumber}
              —
              ${draw.first.prize} ETB
            </div>

            <div>
              🥈
              ${escapeHTML(draw.second.name)}
              —
              Ticket ${draw.second.ticketNumber}
              —
              ${draw.second.prize} ETB
            </div>

            <div>
              🥉
              ${escapeHTML(draw.third.name)}
              —
              Ticket ${draw.third.ticketNumber}
              —
              ${draw.third.prize} ETB
            </div>

          </div>

        </div>
      `;
    });

    container.innerHTML = html;

    await loadLatestDraw();

  } catch (error) {

    console.error(error);
  }
}

// =====================================================
// USERS
// =====================================================

async function loadUsers() {

  try {

    const response =
      await fetch(
        "/api/admin/users"
      );

    const data =
      await response.json();

    const container =
      document.getElementById(
        "usersContainer"
      );

    if (
      !data.users ||
      !data.users.length
    ) {

      container.innerHTML =
        `<div class="empty">
          No users yet.
        </div>`;

      return;
    }

    let html = "";

    data.users.forEach(user => {

      html += `
        <div class="user-card">

          <div>
            <h3>
              ${escapeHTML(user.name)}
            </h3>

            <p>
              📱 ${escapeHTML(user.phone)}
            </p>

            <p>
              ID:
              ${escapeHTML(user.id)}
            </p>
          </div>

          <div class="user-balance">
            <span>Balance</span>

            <strong>
              ${Number(user.balance || 0).toLocaleString()}
              ETB
            </strong>
          </div>

          <div class="balance-actions">

            <button
              class="add-button"
              onclick="addBalance('${user.id}')"
            >
              + Add
            </button>

            <button
              class="remove-button"
              onclick="removeBalance('${user.id}')"
            >
              − Remove
            </button>

          </div>

        </div>
      `;
    });

    container.innerHTML = html;

  } catch (error) {

    console.error(error);
  }
}

// =====================================================
// ADD BALANCE
// =====================================================

async function addBalance(userId) {

  const amount =
    Number(
      prompt("Enter amount to add:")
    );

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return;
  }

  const reason =
    prompt(
      "Reason:",
      "Added by admin"
    );

  try {

    const response =
      await fetch(
        `/api/admin/user/${userId}/add-balance`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            amount,
            reason
          })
        }
      );

    const data =
      await response.json();

    if (!data.success) {
      alert(data.message);
      return;
    }

    alert(
      `${amount} ETB added successfully.`
    );

    await loadUsers();
    await loadBalanceTransactions();

  } catch (error) {

    console.error(error);

    alert(
      "Unable to add balance."
    );
  }
}

// =====================================================
// REMOVE BALANCE
// =====================================================

async function removeBalance(userId) {

  const amount =
    Number(
      prompt("Enter amount to remove:")
    );

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return;
  }

  const reason =
    prompt(
      "Reason:",
      "Removed by admin"
    );

  try {

    const response =
      await fetch(
        `/api/admin/user/${userId}/remove-balance`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            amount,
            reason
          })
        }
      );

    const data =
      await response.json();

    if (!data.success) {
      alert(data.message);
      return;
    }

    alert(
      `${amount} ETB removed successfully.`
    );

    await loadUsers();
    await loadBalanceTransactions();

  } catch (error) {

    console.error(error);

    alert(
      "Unable to remove balance."
    );
  }
}

// =====================================================
// BALANCE TRANSACTIONS
// =====================================================

async function loadBalanceTransactions() {

  try {

    const response =
      await fetch(
        "/api/admin/balance-transactions"
      );

    const data =
      await response.json();

    const container =
      document.getElementById(
        "balanceTransactions"
      );

    if (
      !data.transactions ||
      !data.transactions.length
    ) {

      container.innerHTML =
        `<div class="empty">
          No balance transactions.
        </div>`;

      return;
    }

    let html = "";

    data.transactions.forEach(tx => {

      const cls =
        tx.type === "CREDIT"
          ? "credit"
          : "debit";

      const sign =
        tx.type === "CREDIT"
          ? "+"
          : "-";

      html += `
        <div class="balance-transaction">

          <div>
            <strong>
              ${escapeHTML(tx.name)}
            </strong>

            <small>
              ${escapeHTML(tx.reason)}
            </small>
          </div>

          <div class="${cls}">
            ${sign}${tx.amount} ETB
          </div>

          <div>
            Balance:
            ${tx.newBalance} ETB
          </div>

          <small>
            ${formatDate(tx.createdAt)}
          </small>

        </div>
      `;
    });

    container.innerHTML = html;

  } catch (error) {

    console.error(error);
  }
}

// =====================================================
// START
// =====================================================

loadEverything();