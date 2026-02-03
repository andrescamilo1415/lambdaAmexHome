import Busboy from "busboy";
import {
  SESClient,
  SendEmailCommand,
  SendRawEmailCommand,
} from "@aws-sdk/client-ses";
import dotenv from "dotenv";
dotenv.config();
const emailFrom = process.env.NOTIFICATION_EMAIL;
const ses = new SESClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AMZAWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AMZAWS_SECRET_ACCESS_KEY,
  },
}); // Cambia a tu región

export const handler = async (event) => {
  try {
    if (!event.body) {
      return response(400, "No body received");
    }

    const contentType =
      event.headers["content-type"] || event.headers["Content-Type"];

    if (!contentType?.includes("multipart/form-data")) {
      return response(400, "Invalid content-type");
    }

    const busboy = Busboy({
      headers: { "content-type": contentType },
    });

    const fields = {};
    const files = [];

    const body = Buffer.from(
      event.body,
      event.isBase64Encoded ? "base64" : "utf8",
    );

    await new Promise((resolve, reject) => {
      busboy.on("field", (name, value) => {
        fields[name] = value;
      });

      busboy.on("file", (name, file, info) => {
        const { filename, mimeType } = info;
        const chunks = [];

        file.on("data", (data) => chunks.push(data));
        file.on("end", () => {
          files.push({
            filename,
            content: Buffer.concat(chunks),
            contentType: mimeType,
          });
        });
      });

      busboy.on("finish", resolve);
      busboy.on("error", reject);

      busboy.end(body);
    });

    const html = `
      <h2>Nuevo formulario recibido</h2>
      <ul>
        <li><b>Nombre:</b> ${fields.name}</li>
        <li><b>Email:</b> ${fields.email}</li>
        <li><b>Teléfono:</b> ${fields.phone}</li>
        <li><b>Asunto:</b> ${fields.subject}</li>
        <li><b>Mensaje:</b> ${fields.message}</li>
        <li><b>Promo:</b> ${fields.promo}</li>
        <li><b>Reminders:</b> ${fields.reminders}</li>
      </ul>
    `;
    console.log(html);
    console.log("TO_EMAIL: ", process.env.TO_EMAIL);
    console.log("emailFrom: ", process.env.NOTIFICATION_EMAIL);
    const resp = await sendEmail({
      to: process.env.TO_EMAIL,
      subject: "NUEVO CONTACTO",
      html,
      from: emailFrom,
      attachments: files,
    });

    console.log(resp);

    return response(200, "Correo enviado correctamente");
  } catch (error) {
    console.error("ERROR:", error);
    return response(500, error.message || "Error enviando correo");
  }
};

// ---- Helper de respuesta ----
function response(statusCode, message) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({ message }),
  };
}

export const sendEmail = async ({
  to,
  subject,
  html,
  from,
  attachments = [],
}) => {
  // If there are no attachments, fall back to SendEmailCommand
  if (!attachments || attachments.length === 0) {
    const params = {
      Destination: { ToAddresses: [to] },
      Message: {
        Body: { Html: { Data: html } },
        Subject: { Data: subject },
      },
      Source: from,
    };

    try {
      const command = new SendEmailCommand(params);
      const result = await ses.send(command);
      console.log("📨 Email enviado:", result);
      return result;
    } catch (error) {
      console.error("❌ Error enviando email:", error);
      throw error;
    }
  }

  // Build a raw MIME message for attachments
  const boundary = `----=_Part_${Date.now()}`;
  const lines = [];

  lines.push(`From: ${from}`);
  lines.push(`To: ${to}`);
  lines.push(`Subject: ${subject}`);
  lines.push("MIME-Version: 1.0");
  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  lines.push("");

  // HTML part
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/html; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: 7bit");
  lines.push("");
  lines.push(html || "");
  lines.push("");

  // Attachments
  for (const att of attachments) {
    const filename = att.filename || att.name || "attachment";
    const contentType =
      att.contentType || att.type || "application/octet-stream";
    const contentBuffer = Buffer.isBuffer(att.content)
      ? att.content
      : Buffer.from(att.content || "", "base64");
    const base64 = contentBuffer.toString("base64");

    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${contentType}; name="${filename}"`);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push(`Content-Disposition: attachment; filename="${filename}"`);
    lines.push("");
    // split base64 into lines of 76 chars per RFC
    for (let i = 0; i < base64.length; i += 76) {
      lines.push(base64.substr(i, 76));
    }
    lines.push("");
  }

  lines.push(`--${boundary}--`);

  const rawMessage = lines.join("\r\n");

  const params = {
    RawMessage: { Data: Buffer.from(rawMessage) },
    Source: from,
    Destinations: [to],
  };

  try {
    const command = new SendRawEmailCommand(params);
    const result = await ses.send(command);
    console.log("📨 Email enviado (raw):", result);
    return result;
  } catch (error) {
    console.error("❌ Error enviando email (raw):", error);
    throw error;
  }
};
