const nodemailer = require("nodemailer");
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
let smtpTransporter = null;

function toMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
}

function normalizeEmail(email) {
  if (!email || typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

function envFlag(value) {
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function normalizeProvider(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getMailProvider() {
  return normalizeProvider(process.env.MAIL_PROVIDER || "");
}

function shouldUseSmtp() {
  const provider = getMailProvider();
  if (["smtp", "google", "gmail", "google_smtp"].includes(provider)) return true;
  if (provider === "brevo") return false;
  return Boolean(process.env.SMTP_HOST || process.env.SMTP_USER || process.env.SMTP_PASS);
}

function getSmtpConfig() {
  const host = String(process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure =
    envFlag(process.env.SMTP_SECURE) || (!Number.isNaN(port) && Number(port) === 465);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const fromEmail = String(process.env.SMTP_FROM_EMAIL || user).trim();
  const fromName = String(process.env.SMTP_FROM_NAME || "Renpay").trim();

  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    secure,
    user,
    pass,
    fromEmail,
    fromName,
  };
}

function getSmtpTransporter() {
  const config = getSmtpConfig();
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
  }
  return { transporter: smtpTransporter, config };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatOrderLine(order) {
  const orderNumber = String(order.orderNumber || "").trim();
  const orderName = String(order.orderName || "").trim();
  const amount = toMoney(order.amount).toFixed(2);
  return `${orderNumber} | ${orderName} | $${amount}`;
}

function buildOrdersSummary(orders) {
  const lines = Array.isArray(orders) ? orders.map(formatOrderLine).filter(Boolean) : [];
  return lines.join("\n");
}

function buildPlainTextOrderPaidEmail({ customerName, totalAmount, leafBalance, ordersSummary }) {
  return [
    `Hi ${customerName || "there"},`,
    "",
    "Your order payment has been completed successfully.",
    `Total paid: $${toMoney(totalAmount).toFixed(2)} USD`,
    `Leaf balance after payment: ${toMoney(leafBalance).toFixed(2)} Leaf`,
    "",
    "Paid orders:",
    ordersSummary || "-",
    "",
    "Thank you for using Renpay.",
  ].join("\n");
}

function buildHtmlOrderPaidEmail({
  customerName,
  totalAmount,
  leafBalance,
  paidOrderCount,
  ordersSummary,
  appUrl,
}) {
  const safeName = escapeHtml(customerName || "there");
  const safeTotal = escapeHtml(toMoney(totalAmount).toFixed(2));
  const safeLeaf = escapeHtml(toMoney(leafBalance).toFixed(2));
  const safeCount = escapeHtml(String(Number(paidOrderCount || 0)));
  const safeOrders = escapeHtml(ordersSummary || "-");
  const safeAppUrl = escapeHtml(appUrl || "https://renpay.vercel.app");

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Renpay Payment Confirmed</title>
    <style>
      @media screen and (max-width: 600px) {
        .rp-wrap {
          padding: 16px !important;
        }
        .rp-card {
          border-radius: 12px !important;
        }
        .rp-px {
          padding-left: 16px !important;
          padding-right: 16px !important;
        }
        .rp-title {
          font-size: 38px !important;
        }
        .rp-value {
          font-size: 20px !important;
        }
      }
    </style>
  </head>
  <body style="margin:0;background:#f2efe9;font-family:Arial,sans-serif;color:#1f2937;">
    <table class="rp-wrap" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;">
      <tr>
        <td align="center">
          <table class="rp-card" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e8dcc9;border-radius:16px;overflow:hidden;">
            <tr>
              <td class="rp-px" style="background:#1f1a16;padding:10px 24px;">
                <span style="display:inline-block;padding:6px 10px;background:#f2b94b;color:#2a1f12;font-size:12px;font-weight:700;border-radius:999px;">PAYMENT CONFIRMED</span>
              </td>
            </tr>
            <tr>
              <td class="rp-px" style="padding:24px;background:#f5e7cf;border-bottom:1px solid #e8dcc9;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td valign="top" style="padding-right:12px;">
                      <div class="rp-title" style="font-size:44px;line-height:1.02;font-weight:800;color:#2d2115;letter-spacing:-0.03em;">Renpay</div>
                      <div style="margin-top:8px;font-size:16px;color:#5f4a33;">Order payment receipt</div>
                    </td>
                    <td align="right" valign="top" style="width:120px;">
                      <div style="font-size:12px;color:#6f5a43;">Status</div>
                      <div style="margin-top:4px;font-size:14px;font-weight:700;color:#2f7a3f;">Completed</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="rp-px" style="padding:24px 24px 12px;">
                <p style="margin:0;font-size:30px;line-height:1.25;color:#171717;word-break:break-word;overflow-wrap:anywhere;">
                  Hi <strong>${safeName}</strong>, your payment was successful.
                </p>
              </td>
            </tr>
            <tr>
              <td class="rp-px" style="padding:0 24px 20px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eddcc3;border-radius:12px;overflow:hidden;background:#fffaf2;">
                  <tr>
                    <td style="padding:12px 14px;border-bottom:1px solid #eddcc3;font-size:13px;color:#7a664f;">Orders paid</td>
                    <td class="rp-value" align="right" style="padding:12px 14px;border-bottom:1px solid #eddcc3;font-size:24px;font-weight:800;color:#1f2937;word-break:break-word;overflow-wrap:anywhere;">
                      ${safeCount}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:12px 14px;border-bottom:1px solid #eddcc3;font-size:13px;color:#7a664f;">Total paid</td>
                    <td class="rp-value" align="right" style="padding:12px 14px;border-bottom:1px solid #eddcc3;font-size:24px;font-weight:800;color:#1f2937;word-break:break-word;overflow-wrap:anywhere;">
                      $${safeTotal} USD
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:12px 14px;font-size:13px;color:#7a664f;">Leaf balance after payment</td>
                    <td class="rp-value" align="right" style="padding:12px 14px;font-size:24px;font-weight:800;color:#1f2937;word-break:break-word;overflow-wrap:anywhere;">
                      ${safeLeaf} Leaf
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="rp-px" style="padding:0 24px 8px;">
                <div style="font-size:14px;font-weight:700;color:#3f2f1f;">Paid order details</div>
              </td>
            </tr>
            <tr>
              <td class="rp-px" style="padding:0 24px 24px;">
                <pre style="margin:0;padding:14px;background:#fbf6ee;border:1px solid #eddcc3;border-radius:10px;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;line-height:1.6;font-family:Consolas,Monaco,monospace;font-size:12px;color:#3a3128;">${safeOrders}</pre>
              </td>
            </tr>
            <tr>
              <td class="rp-px" align="center" style="padding:0 24px 26px;">
                <a href="${safeAppUrl}" style="display:inline-block;padding:12px 22px;background:#d97706;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;">Open Renpay</a>
              </td>
            </tr>
            <tr>
              <td class="rp-px" style="padding:16px 24px;background:#f8f3ea;border-top:1px solid #e8dcc9;">
                <div style="font-size:12px;line-height:1.6;color:#7a664f;">
                  Need help? Reply to this email and our team will assist.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendBrevoEmail(payload) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return { sent: false, skipped: true, reason: "BREVO_API_KEY missing" };
  }

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": apiKey,
      ...(envFlag(process.env.BREVO_SANDBOX_MODE) ? { "X-Sib-Sandbox": "drop" } : {}),
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data && data.message ? data.message : `HTTP ${response.status}`;
    throw new Error(`Brevo send failed: ${detail}`);
  }

  return {
    sent: true,
    skipped: false,
    messageId: data && data.messageId ? data.messageId : null,
  };
}

function getBrevoSender() {
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.BREVO_FROM_EMAIL;
  if (!senderEmail) return null;
  return {
    email: senderEmail,
    name: process.env.BREVO_SENDER_NAME || "Renpay",
  };
}

async function sendSmtpEmail({ toEmail, toName, subject, textContent, htmlContent }) {
  const normalizedEmail = normalizeEmail(toEmail);
  if (!normalizedEmail) {
    return { sent: false, skipped: true, reason: "recipient email missing" };
  }

  const { transporter, config } = getSmtpTransporter();
  if (!config.user || !config.pass || !config.fromEmail) {
    return {
      sent: false,
      skipped: true,
      reason: "SMTP_USER/SMTP_PASS/SMTP_FROM_EMAIL missing",
    };
  }

  const info = await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to: toName ? `"${toName}" <${normalizedEmail}>` : normalizedEmail,
    subject: subject || "Notification",
    text: textContent || "",
    html: htmlContent || "",
  });

  return {
    sent: true,
    skipped: false,
    messageId: info && info.messageId ? info.messageId : null,
    provider: "smtp",
  };
}

async function sendMagicLinkEmail({ toEmail, toName, loginUrl, expiresMinutes }) {
  const normalizedEmail = normalizeEmail(toEmail);
  if (!normalizedEmail) {
    return { sent: false, skipped: true, reason: "recipient email missing" };
  }

  const recipientName = String(toName || "").trim() || normalizedEmail.split("@")[0];
  const safeName = escapeHtml(recipientName);
  const safeUrl = escapeHtml(loginUrl || "");
  const ttl = Number(expiresMinutes || 10);

  const subject = "Your Renpay sign-in link";
  const textContent = [
    `Hi ${recipientName},`,
    "",
    "Use this secure link to sign in to Renpay:",
    loginUrl || "",
    "",
    `This link expires in ${ttl} minutes.`,
    "If you did not request this email, you can ignore it.",
  ].join("\n");
  const htmlContent = `<!doctype html>
<html>
  <body style="margin:0;background:#f6f6f6;font-family:Arial,sans-serif;color:#111827;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:20px 20px 8px;font-size:24px;font-weight:700;">Renpay</td>
            </tr>
            <tr>
              <td style="padding:0 20px 12px;font-size:16px;line-height:1.6;">
                Hi <strong>${safeName}</strong>, use this secure link to sign in.
              </td>
            </tr>
            <tr>
              <td style="padding:0 20px 16px;">
                <a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;">Sign in to Renpay</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 20px 16px;font-size:14px;line-height:1.6;color:#4b5563;">
                This link expires in ${ttl} minutes. If you did not request this email, you can ignore it.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  if (shouldUseSmtp()) {
    return sendSmtpEmail({
      toEmail: normalizedEmail,
      toName: recipientName,
      subject,
      textContent,
      htmlContent,
    });
  }

  const sender = getBrevoSender();
  if (!sender) {
    return { sent: false, skipped: true, reason: "BREVO_SENDER_EMAIL missing" };
  }

  return sendBrevoEmail({
    sender,
    to: [{ email: normalizedEmail, name: recipientName }],
    subject,
    textContent,
    htmlContent,
    tags: ["auth", "magic_link"],
  });
}

async function sendOrderPaidEmail({
  toEmail,
  toName,
  totalAmount,
  leafBalance,
  paidOrders,
  appUrl,
}) {
  const normalizedEmail = normalizeEmail(toEmail);
  if (!normalizedEmail) {
    return { sent: false, skipped: true, reason: "recipient email missing" };
  }

  const ordersSummary = buildOrdersSummary(paidOrders || []);
  const recipientName = String(toName || "").trim() || normalizedEmail.split("@")[0];
  const subject = `Payment received: ${Array.isArray(paidOrders) ? paidOrders.length : 0} order(s)`;
  const textContent = buildPlainTextOrderPaidEmail({
    customerName: recipientName,
    totalAmount,
    leafBalance,
    ordersSummary,
  });
  const htmlContent = buildHtmlOrderPaidEmail({
    customerName: recipientName,
    totalAmount,
    leafBalance,
    paidOrderCount: Array.isArray(paidOrders) ? paidOrders.length : 0,
    ordersSummary,
    appUrl: appUrl || process.env.NEXT_PUBLIC_APP_URL || "https://renpay.vercel.app",
  });

  if (shouldUseSmtp()) {
    return sendSmtpEmail({
      toEmail: normalizedEmail,
      toName: recipientName,
      subject,
      textContent,
      htmlContent,
    });
  }

  const sender = getBrevoSender();
  if (!sender) {
    return { sent: false, skipped: true, reason: "BREVO_SENDER_EMAIL missing" };
  }
  const templateIdRaw = process.env.BREVO_TEMPLATE_ORDER_PAID;
  const templateId = Number(templateIdRaw);

  if (templateIdRaw && Number.isFinite(templateId) && templateId > 0) {
    return sendBrevoEmail({
      sender,
      to: [{ email: normalizedEmail, name: recipientName }],
      templateId,
      params: {
        customer_name: recipientName,
        paid_order_count: Array.isArray(paidOrders) ? paidOrders.length : 0,
        total_amount: toMoney(totalAmount).toFixed(2),
        leaf_balance: toMoney(leafBalance).toFixed(2),
        orders_summary: ordersSummary || "-",
        app_url: appUrl || process.env.NEXT_PUBLIC_APP_URL || "https://renpay.vercel.app",
      },
      tags: ["order_paid", "leaf"],
    });
  }

  return sendBrevoEmail({
    sender,
    to: [{ email: normalizedEmail, name: recipientName }],
    subject,
    textContent,
    htmlContent,
    tags: ["order_paid", "leaf"],
  });
}

async function sendReferralInviteEmail({ toEmail, toName, referrerName, inviteUrl }) {
  const normalizedEmail = normalizeEmail(toEmail);
  if (!normalizedEmail) {
    return { sent: false, skipped: true, reason: "recipient email missing" };
  }

  const recipientName = String(toName || "").trim() || normalizedEmail.split("@")[0];
  const senderName = String(referrerName || "A Renpay user").trim();
  const safeRecipient = escapeHtml(recipientName);
  const safeSender = escapeHtml(senderName);
  const safeInviteUrl = escapeHtml(inviteUrl || process.env.NEXT_PUBLIC_APP_URL || "https://renpay.vercel.app");

  const subject = `${senderName} invited you to Renpay`;
  const textContent = [
    `Hi ${recipientName},`,
    "",
    `${senderName} invited you to Renpay.`,
    "When you subscribe, both of you receive 1 free month.",
    "",
    `Start here: ${inviteUrl || process.env.NEXT_PUBLIC_APP_URL || "https://renpay.vercel.app"}`,
  ].join("\n");

  const htmlContent = `<!doctype html>
<html>
  <body style="margin:0;background:#f6f6f6;font-family:Arial,sans-serif;color:#111827;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:20px 20px 8px;font-size:24px;font-weight:700;">Renpay</td>
            </tr>
            <tr>
              <td style="padding:0 20px 12px;font-size:16px;line-height:1.6;">
                Hi <strong>${safeRecipient}</strong>, <strong>${safeSender}</strong> invited you to Renpay.
              </td>
            </tr>
            <tr>
              <td style="padding:0 20px 16px;font-size:14px;line-height:1.6;color:#4b5563;">
                After you activate a subscription, both of you receive <strong>1 free month</strong>.
              </td>
            </tr>
            <tr>
              <td style="padding:0 20px 20px;">
                <a href="${safeInviteUrl}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;">Open Renpay</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  if (shouldUseSmtp()) {
    return sendSmtpEmail({
      toEmail: normalizedEmail,
      toName: recipientName,
      subject,
      textContent,
      htmlContent,
    });
  }

  const sender = getBrevoSender();
  if (!sender) {
    return { sent: false, skipped: true, reason: "BREVO_SENDER_EMAIL missing" };
  }

  return sendBrevoEmail({
    sender,
    to: [{ email: normalizedEmail, name: recipientName }],
    subject,
    textContent,
    htmlContent,
    tags: ["referral_invite"],
  });
}

module.exports = {
  sendMagicLinkEmail,
  sendOrderPaidEmail,
  sendReferralInviteEmail,
};
