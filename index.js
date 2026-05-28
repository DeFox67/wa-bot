const express = require("express");
const qrcode = require("qrcode-terminal");
const axios = require("axios");
const { LocalAuth, Client } = require("whatsapp-web.js");
const { google } = require("googleapis");
require("dotenv").config();

console.log(
  "Cek Email Service Account:",
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
);
console.log(
  "Apakah Private Key terdefinisi?:",
  process.env.GOOGLE_PRIVATE_KEY ? "YA" : "TIDAK",
);
// console.log(process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"))

const app = express();
const port = process.env.PORT || 3000;

const cleanPrivateKey = process.env.GOOGLE_PRIVATE_KEY
  ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
      .replace(/['"]/g, "")
      .trim()
  : null;

const SPREADSHEET_ID = "1IdULcZXUOnbUMmIdMFnu7L0AQK7c2w2WOFl6BiNGHR8";

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "GJ_Bot" }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  },
});

client.on("qr", (qr) => qrcode.generate(qr, { small: true }));
client.on("authenticated", () => console.log("discann..."));
client.on("ready", () => console.log("service ready to go..."));

client.on("message", async (message) => {
  // messageBody diubah ke lowercase HANYA untuk mempermudah pengecekan kondisi IF
  const messageBody = message.body.trim().toLocaleLowerCase();

  if (messageBody.startsWith("bot retur")) {
    const userQuestion = message.body.substring(9);
    const formRetur = `*Formulir Pengajuan Retur* 📦

Halo, silahkan isi rincian wilayah yang ingin di retur di bawah ini:

📍 *WILAYAH*
KOTA:
KECAMATAN:
KELURAHAN:

🌾 *KENDALA RETUR BERAS*
*(TOLONG ISI DENGAN JUMLAH KARUNG)*

LEPAS JAHITAN:
BOLONG:
KURANG:
Busuk :

💧 *KENDALA RETUR MINYAK*
*(TOLONG ISI DENGAN JUMLAH LITER BUKAN POUCH)*

BOCOR:
KURANG:

👤 *DATA DIRI*
NAMA KORCAM:
No Hp:

📅 *WAKTU RETUR*
KAPAN INGIN DI RETUR:

*PERHATIAN, HARAP ISI DENGAN LENGKAP DAN SEKSAMA SUPAYA MELANCARKAN PROSES PENGAJUAN.*

TERIMAKASIH...`;

    console.log({ userQuestion });
    // Gunakan await untuk memastikan pesan terkirim dengan aman
    await message.reply(formRetur);
  }
  // Pengecekan kondisi disesuaikan dengan isi messageBody yang sudah huruf kecil semua
  else if (
    messageBody.includes("formulir pengajuan retur") &&
    messageBody.includes("kota:")
  ) {
    try {
      // Ambil string asli dari "message.body" agar Regex COCOK dengan format huruf kapital pada form
      const originalText = message.body;
      console.log(originalText);

      // 1. Pecah teks terlebih dahulu untuk memisahkan Kendala Beras dan Minyak
      const bagianBeras = originalText.split("KENDALA RETUR MINYAK")[0];
      const bagianMinyak = originalText.split("KENDALA RETUR MINYAK")[1] || "";

      // 2. Ekstrak data langsung ke dalam satu Object bersih
      const dataRetur = {
        timestamp: new Date().toLocaleString("id-ID"),
        namaKorcam:
          originalText.match(/NAMA KORCAM:[ \t]*([^\n\r]*)/)?.[1]?.trim() || "",
        noHp:
          "'" +
          (originalText.match(/No Hp:[ \t]*([^\n\r]*)/)?.[1]?.trim() || ""),
        waktuRetur:
          originalText
            .match(/KAPAN INGIN DI RETUR:[ \t]*([^\n\r]*)/)?.[1]
            ?.trim() || "",

        // Wilayah
        kota: originalText.match(/KOTA:[ \t]*([^\n\r]*)/)?.[1]?.trim() || "",
        kecamatan:
          originalText.match(/KECAMATAN:[ \t]*([^\n\r]*)/)?.[1]?.trim() || "",

        kelurahan:
          originalText.match(/KELURAHAN:[ \t]*([^\n\r]*)/)?.[1]?.trim() || "",

        // Kendala Beras (Hanya mengambil dari bagianBeras)
        berasLepas:
          bagianBeras
            .match(/LEPAS JAHITAN:\s*(.*)/)?.[1]
            ?.replace(/[^0-9]/g, "")
            .trim() || "0",
        berasBolong:
          bagianBeras
            .match(/BOLONG:\s*(.*)/)?.[1]
            ?.replace(/[^0-9]/g, "")
            .trim() || "0",
        berasKurang:
          bagianBeras
            .match(/KURANG:\s*(.*)/)?.[1]
            ?.replace(/[^0-9]/g, "")
            .trim() || "0",
        BerasRusak:
          bagianBeras
            .match(/Busuk:\s*(.*)/)?.[1]
            ?.replace(/[^0-9]/g, "")
            .trim() || "0",

        // Kendala Minyak (Hanya mengambil dari bagianMinyak)
        minyakBocor:
          bagianMinyak
            .match(/BOCOR:\s*(.*)/)?.[1]
            ?.replace(/[^0-9]/g, "")
            .trim() || "0",
        minyakKurang:
          bagianMinyak
            .match(/KURANG:\s*(.*)/)?.[1]
            ?.replace(/[^0-9]/g, "")
            .trim() || "0",
      };

      // Validasi minimal agar tidak memasukkan data kosong ke spreadsheet
      if (
        !dataRetur.namaKorcam ||
        !dataRetur.kota ||
        !dataRetur.kecamatan ||
        !dataRetur.kelurahan ||
        !dataRetur.noHp
      ) {
        return message.reply(
          "❌ Gagal memproses. Mohon pastikan DATA KORCAM dan WILAYAH sudah diisi.",
        );
      }

      const auth = new google.auth.JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,

        key: cleanPrivateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      await auth.authorize();

      console.log(auth, "ini dari auth");

      const sheets = google.sheets({ version: "v4", auth: auth });
      // 4. Susun data dalam bentuk baris (Array) sesuai urutan kolom di Google Sheet Anda
      // Pastikan urutan ini pas dengan struktur kolom A, B, C, D... di Excel Anda
      const barisData = [
        dataRetur.timestamp, // Kolom A
        dataRetur.namaKorcam, // Kolom B
        dataRetur.waktuRetur, // Kolom C
        dataRetur.kota, // Kolom D
        dataRetur.kecamatan, // Kolom E
        dataRetur.kelurahan, // Kolom F
        dataRetur.berasLepas, // Kolom G
        dataRetur.berasBolong, // Kolom H
        dataRetur.berasKurang, // Kolom I
        dataRetur.BerasRusak,
        dataRetur.minyakBocor, // Kolom J
        dataRetur.minyakKurang, // Kolom K
        "Belum di retur",
        dataRetur.noHp,
      ];

      console.log("Data yang akan dikirim:", barisData);

      // 5. Masukkan data ke Google Sheets (Append)
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "Sheet1!A:O", // Jangkauan disesuaikan sampai kolom K (11 kolom)
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [barisData],
        },
      });

      // 6. Beri respon sukses ke user
      await message.reply(
        `✅ *Terima kasih ${dataRetur.namaKorcam}!*\nData pengajuan retur Anda telah berhasil dicatat ke dalam sistem.`,
      );
    } catch (error) {
      console.error("Error input ke Spreadsheet:", error);
      await message.reply(
        "❌ Terjadi kesalahan sistem saat menyimpan data. Mohon hubungi admin.",
      );
    }
  } else if (messageBody.includes("cari")) {
    const searchMessage = message.body;

    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,

      key: cleanPrivateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    await auth.authorize();

    const sheets = google.sheets({ version: "v4", auth: auth });

    // ambil kata setelah "cari"
    const result = searchMessage.match(/^cari\s+(.+)$/i);

    if (result) {
      const keyword = result[1].trim().toLowerCase();

      // ambil data dari spreadsheet
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "Sheet1!A:O",
      });

      const rows = response.data.values;
      console.log(rows);

      if (!rows || rows.length === 0) {
        await message.reply("Data tidak ditemukan");
        return;
      }

      // cari data yang exact match
      const found = rows.find((row) =>
        row.some((cell) => String(cell).toLowerCase() === keyword),
      );
      console.log(found);
      const pesan = `
      📋 *DATA DITEMUKAN*

      👤 Korcam        : ${found[1]}
      📅 Tanggal Retur : ${found[2]}
      📱 No HP          : ${found[13]}
      📌 Status         : ${found[12]}

      📍 *Wilayah*
          - Kota     : ${found[3]}
          - Kecamatan: ${found[4]}
          - Kelurahan: ${found[5]}

      📦 Detail
        - Beras Lepas Jahit : ${found[6]}
        - Beras Bolong : ${found[7]}
        - Beras Kurang : ${found[8]}
        - Beras Rusak : ${found[9]}
        - Minyak Bocor : ${found[10]}
        - Minyak Kurang : ${found[11]}
      `;
      if (found) {
        await message.reply(`\n${pesan}`);
      } else {
        await message.reply("Data tidak ditemukan");
      }
    }
  }
});

client.initialize();

app.listen(port, () => console.log("server running di port:" + port));
