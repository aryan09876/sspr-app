import nodemailer from "nodemailer";
import { OTP_EXPIRY_MINUTES } from "./otp";

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// SVG inline compatibles email (stroke, pas fill — style Lucide)
const SVG_SHIELD = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`;

const SVG_KEY = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3L22 7l-3-3"/></svg>`;

const SVG_CLOCK = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

const SVG_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const transporter = createTransporter();
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
  const appName = process.env.APP_NAME ?? "SSPR";

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Réinitialisation de mot de passe – ${appName}</title>
</head>
<body style="margin:0;padding:0;background:linear-gradient(to bottom,#f8fafc,#f1f5f9);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif;min-height:100vh;">

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:48px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;width:100%;">

        <!-- En-tête : icône bouclier + nom -->
        <tr>
          <td align="center" style="padding-bottom:24px;">
            <table cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="background:#2563eb;border-radius:16px;width:64px;height:64px;text-align:center;vertical-align:middle;box-shadow:0 4px 14px rgba(37,99,235,0.30);">
                  <div style="line-height:0;padding:18px;">${SVG_SHIELD}</div>
                </td>
              </tr>
            </table>
            <p style="margin:16px 0 4px;font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.3px;">${appName}</p>
            <p style="margin:0;font-size:13px;color:#64748b;">Portail de réinitialisation de mot de passe Active Directory</p>
          </td>
        </tr>

        <!-- Carte principale -->
        <tr>
          <td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">

              <!-- Card Header : icône clé + titre -->
              <tr>
                <td style="padding:24px 32px 0;">
                  <table cellpadding="0" cellspacing="0" role="presentation">
                    <tr>
                      <td style="background:#eff6ff;border-radius:50%;width:40px;height:40px;text-align:center;vertical-align:middle;">
                        <div style="line-height:0;padding:11px;">${SVG_KEY}</div>
                      </td>
                      <td style="padding-left:12px;vertical-align:middle;">
                        <p style="margin:0;font-size:17px;font-weight:600;color:#0f172a;">Code de vérification</p>
                        <p style="margin:3px 0 0;font-size:13px;color:#64748b;">Réinitialisation de mot de passe</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Séparateur -->
              <tr>
                <td style="padding:0 32px;">
                  <div style="height:1px;background:#f1f5f9;margin:20px 0;"></div>
                </td>
              </tr>

              <!-- Corps -->
              <tr>
                <td style="padding:0 32px 24px;">
                  <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.7;">
                    Bonjour,<br><br>
                    Vous avez demandé la réinitialisation de votre mot de passe <strong style="color:#334155;">Active Directory</strong>.
                    Voici votre code de vérification à usage unique :
                  </p>

                  <!-- Bloc OTP -->
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                         style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:20px;">
                    <tr>
                      <td style="padding:28px 24px;text-align:center;">
                        <p style="margin:0 0 12px;font-size:11px;font-weight:600;color:#64748b;letter-spacing:1.5px;text-transform:uppercase;">Votre code</p>
                        <p style="margin:0;font-size:44px;font-weight:800;color:#0f172a;letter-spacing:14px;font-family:'Courier New',Courier,monospace;line-height:1;">${otp}</p>

                        <!-- Badge expiration avec icône horloge SVG -->
                        <table cellpadding="0" cellspacing="0" role="presentation" style="margin:18px auto 0;">
                          <tr>
                            <td style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:20px;padding:5px 14px;">
                              <table cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                  <td style="vertical-align:middle;line-height:0;padding-right:5px;">${SVG_CLOCK}</td>
                                  <td style="vertical-align:middle;">
                                    <span style="font-size:12px;color:#64748b;">Expire dans <strong style="color:#334155;">${OTP_EXPIRY_MINUTES} minutes</strong></span>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <!-- Bloc sécurité avec icônes check SVG -->
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                         style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
                    <tr>
                      <td style="padding:16px 18px;">
                        <p style="margin:0 0 10px;font-size:12px;font-weight:600;color:#334155;">Informations de sécurité</p>
                        <table cellpadding="0" cellspacing="0" role="presentation" width="100%">
                          <tr>
                            <td style="vertical-align:top;line-height:0;padding-top:2px;padding-right:8px;width:14px;">${SVG_CHECK}</td>
                            <td style="font-size:12px;color:#64748b;padding-bottom:6px;">Ce code est <strong>à usage unique</strong> — il sera invalidé après utilisation</td>
                          </tr>
                          <tr>
                            <td style="vertical-align:top;line-height:0;padding-top:2px;padding-right:8px;width:14px;">${SVG_CHECK}</td>
                            <td style="font-size:12px;color:#64748b;padding-bottom:6px;">Ne communiquez jamais ce code à une tierce personne</td>
                          </tr>
                          <tr>
                            <td style="vertical-align:top;line-height:0;padding-top:2px;padding-right:8px;width:14px;">${SVG_CHECK}</td>
                            <td style="font-size:12px;color:#64748b;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Card Footer -->
              <tr>
                <td style="border-top:1px solid #f1f5f9;padding:14px 32px;text-align:center;">
                  <p style="margin:0;font-size:11px;color:#94a3b8;">
                    Ce message est généré automatiquement — merci de ne pas y répondre.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- Footer page -->
        <tr>
          <td align="center" style="padding-top:20px;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">
              ${appName} — Portail de réinitialisation de mot de passe
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`;

  const text = `${appName} – Réinitialisation de mot de passe\n\nVotre code de vérification : ${otp}\n\nCe code expire dans ${OTP_EXPIRY_MINUTES} minutes. Ne le partagez avec personne.\n\nSi vous n'avez pas effectué cette demande, ignorez cet email.`;

  await transporter.sendMail({
    from: `"${appName} SSPR" <${from}>`,
    to,
    subject: `[${otp}] Votre code de réinitialisation de mot de passe`,
    html,
    text,
  });
}
