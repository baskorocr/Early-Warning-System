const { google } = require("googleapis");
const bodyParser = require("body-parser");
const fs = require("fs");

const credentials = require("./auth.json");
const { client_email, private_key } = credentials;
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const spreadsheetId = "1fAKpqgFTR0v20e3mUFOUshLWvM-UMlBVMkWIGwUudOI";
const range = "Pivot AR";

const jwtClient = new google.auth.JWT(client_email, null, private_key, SCOPES);

jwtClient.authorize(function (err, tokens) {
  if (err) {
    // console.log(err);
    return;
  } else {
    // console.log("Connected to Google Sheets API");
  }
});

function send(customer, nomer, invoices, sum) {
  const axios = require("axios");

  const url = "https://api.fonnte.com/send";
  let message =
    "[EARLY WARNING SYSTEM – AR OVERDUE]\n\n" +
    "🚨 Peringatan Dini: AR Overdue 🚨\n\n" +
    "Mohon perhatian! Berikut adalah daftar invoice yang akan melewati jatuh tempo dan memerlukan tindakan segera:\n\n" +
    `Customer: ${customer}\n` +
    "No. Invoice Overdue, Overdue Days, Level KRI, Amount :\n";

  // Loop through each invoice and add it to the message
  invoices.forEach((invoice) => {
    message += `* ${invoice.invoice} [${invoice.overdue}] [${invoice.status}] ${invoice.sum}\n`;
  });

  message += `Total Amount Invoice Overdue: ${sum}\n\n`;
  message +=
    "Tindakan yang Diperlukan:\n" +
    "✅ Segera hubungi customer untuk klarifikasi pembayaran.\n" +
    "✅ Koordinasikan dengan tim terkait untuk tindak lanjut lebih lanjut.\n" +
    '✅ Jika Level KRI "High" atau "Extreme", segera eskalasi ke manajemen.\n\n' +
    "Untuk informasi lebih lengkap mengenai Overdue Invoice bisa akses link dibawah ini:\n" +
    "https://link.dharmap.com/AR-Overdue \n\n" +
    "Harap segera ditindaklanjuti untuk menghindari risiko lebih lanjut.\n" +
    "Terima kasih atas perhatian dan kerja samanya.\n\n" +
    "Finance Team";

  const payload = {
    target: nomer,
    message: message,
    delay: "2",
    countryCode: "62", // optional
  };

  const headers = {
    Authorization: "U1K5nmmWXNMbGjHEWqzG", // change TOKEN to your actual token
  };

  // Send the request only once per customer
  const sendRequest = async () => {
    try {
      const response = await axios.post(url, payload, { headers });
      console.log("Message sent:", response.data); // Log the response
    } catch (error) {
      console.error("Error:", error.message);
    }
  };

  sendRequest(); // Call sendRequest only once for each customer
}

// Function to fetch data from Google Sheets
async function fetchData() {
  try {
    const sheets = google.sheets({ version: "v4", auth: jwtClient });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    const combinedValues = [];

    // Cek jika data tersedia
    if (!response.data.values || response.data.values.length < 2) {
      throw new Error("No data found or insufficient rows.");
    }

    const columnNames = response.data.values[0];

    const customerIndex = columnNames.indexOf("Customer");
    const invoiceIndex = columnNames.indexOf("Invoice Number");
    const statusIndex = columnNames.indexOf("Status");
    const overdueIndex = columnNames.indexOf("Overdue Days");
    const sumIndex = columnNames.indexOf("SUM of Overdue Amount");
    const noIndex = columnNames.indexOf("NoWa");
    const dateIndex = columnNames.indexOf("Date");
    const jamActiveIndex = columnNames.indexOf("JamActive");

    if (
      customerIndex === -1 ||
      invoiceIndex === -1 ||
      statusIndex === -1 ||
      overdueIndex === -1 ||
      sumIndex === -1 ||
      noIndex === -1 ||
      dateIndex === -1 ||
      jamActiveIndex === -1
    ) {
      throw new Error("One or more column names not found.");
    }

    let customerMap = {};

    combinedValues.push(response.data.values[1][7]); // Optional, you can remove this if it's unnecessary

    for (let i = 1; i < response.data.values.length; i++) {
      const row = response.data.values[i];

      const customerValue = row[customerIndex] || "";
      const invoiceValue = row[invoiceIndex] || "";
      const statusValue = row[statusIndex] || "";
      const overdueValue = parseInt(row[overdueIndex]) || 0;
      const sumValue = parseInt(row[sumIndex].replace(/\D/g, "")) || 0;
      const noValue = row[noIndex] || "";
      const dateValue = row[dateIndex] || "";

      if (["HIGH", "EXTREME", "MEDIUM"].includes(statusValue)) {
        if (!customerMap[customerValue]) {
          customerMap[customerValue] = {
            customer: customerValue,
            invoices: [],
            totalSum: 0,
            nomer: noValue,
            date: dateValue,
          };
        }

        // Add invoice with sum for each invoice
        customerMap[customerValue].invoices.push({
          invoice: invoiceValue,
          overdue: overdueValue,
          status: statusValue,
          sum: sumValue, // Add the sum for each invoice
        });

        customerMap[customerValue].totalSum += sumValue;
      }
    }

    // Add all customers with their respective invoice sums to combinedValues
    Object.values(customerMap).forEach((customer) => {
      const invoiceDetails = customer.invoices.map((invoice) => ({
        invoice: invoice.invoice,
        overdue: invoice.overdue,
        status: invoice.status,
        sum: new Intl.NumberFormat("id-ID", {
          style: "currency",
          currency: "IDR",
        }).format(invoice.sum), // Format sum for each invoice
      }));

      combinedValues.push({
        customer: customer.customer,
        invoices: invoiceDetails,
        totalSum: new Intl.NumberFormat("id-ID", {
          style: "currency",
          currency: "IDR",
        }).format(customer.totalSum),
        nomer: customer.nomer,
        date: customer.date,
      });
    });

    return combinedValues; // Mengembalikan semua data setelah loop selesai
  } catch (error) {
    console.error(error);
    throw new Error("Failed to fetch data");
  }
}

function saveLog(data) {
  const timestamp = new Date().toISOString();
  const logData = `${timestamp} - Data:\n${JSON.stringify(data, null, 2)}\n\n`;

  fs.appendFile("log.txt", logData, (err) => {
    if (err) {
      console.error("Gagal menyimpan log:", err);
    } else {
      console.log("Log berhasil disimpan.");
    }
  });
}
async function fetchDataPeriodically() {
  try {
    const data = await fetchData();
    console.log("Data fetched:", data);

    // Lakukan sesuatu dengan data yang baru diambil
    // Misalnya, menyimpan data atau memprosesnya lebih lanjut
  } catch (error) {
    console.error("Error while fetching data:", error.message);
  }
}

// Menjalankan fetchData setiap 10 menit (600000 ms)
setInterval(fetchDataPeriodically, 600000);
// Example usage
async function main() {
  try {
    while (true) {
      const data = await fetchData();

      const on = data[0];

      const currentDate = new Date();
      const formattedDate = currentDate.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

      const currentTime = new Date();
      const options = { timeZone: "Asia/Jakarta", hour12: false };
      const jakartaTime = currentTime.toLocaleString("en-US", options);
      const [hours, minutes] = jakartaTime.split(" ")[1].split(":");

      const timeNow = hours + ":" + minutes;
      // console.log(on);
      console.log(formattedDate);
      console.log(timeNow);

      // Cek jika waktu saat ini sesuai dengan waktu yang ditentukan dalam data
      if (timeNow === on) {
        console.log("Notifikasi Running at: " + currentDate);
        let found = false;
        let foundDates = {}; // Mencatat kombinasi customer dan tanggal yang sudah diproses

        for (let index = 0; index < data.length; index++) {
          const currentDate = data[index].date;
          const customer = data[index].customer;

          // Gabungkan tanggal dan customer sebagai key
          const dateCustomerKey = `${currentDate}_${customer}`;

          // Cek apakah kombinasi tanggal dan customer sudah diproses
          if (formattedDate == currentDate && !foundDates[dateCustomerKey]) {
            // Kirim notifikasi
            send(
              data[index].customer,
              data[index].nomer,
              data[index].invoices,
              data[index].totalSum
            );

            // Tandai kombinasi tanggal dan customer sudah diproses
            foundDates[dateCustomerKey] = true;
            found = true;
          }
        }

        if (!found) {
          console.log("Tidak Ada Jadwal 5R!");
        }
      }

      // Add a delay to prevent the loop from consuming too much CPU
      await new Promise((resolve) => setTimeout(resolve, 60000)); // Delay for 1 minute (60000 milliseconds)
    }
  } catch (error) {
    console.error(error.message);
  }
}

// Call the main function
console.log("Program is running :P");
main();
