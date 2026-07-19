import { Resend } from "resend";

export async function sendLoginCodeEmail({
  email,
  code,
  requestId,
}: {
  email: string;
  code: string;
  requestId: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("轻听账号服务尚未配置 RESEND_API_KEY / AUTH_EMAIL_FROM");
  }

  const resend = new Resend(apiKey);
  const subject = `${code} 是你的轻听登录验证码`;
  const text = `你的轻听登录验证码是 ${code}。10 分钟内有效，请勿转发给任何人。\n\n如果不是你本人操作，可以忽略这封邮件。`;
  const { error } = await resend.emails.send(
    {
      from,
      to: email,
      subject,
      text,
      html: `<div style="font-family:system-ui,-apple-system,sans-serif;color:#24231f;line-height:1.7"><p>你的轻听登录验证码是：</p><p style="font-size:30px;letter-spacing:8px;font-weight:650;margin:20px 0">${code}</p><p>10 分钟内有效，请勿转发给任何人。</p><p style="color:#77736b;font-size:13px">如果不是你本人操作，可以忽略这封邮件。</p></div>`,
    },
    { idempotencyKey: `login-code/${requestId}` },
  );

  if (error) throw new Error(error.message);
}
