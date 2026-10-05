/*
 * Сэтгэл зүйчид очих мэдэгдлийн тохиргоо.
 * Хүлээн авах имэйл, утасны дугаарыг сайтын «Сэтгэл зүйчийн самбар → Тохиргоо» хэсэгт оруулна.
 * Тохируулах заавар: README.md → «Мэдэгдэл (имэйл, SMS)».
 */
export const notifyConfig = {
  /* Имэйл: https://www.emailjs.com (үнэгүй багц: сард 200 имэйл).
     Эдгээр түлхүүрүүд нь нийтэд ил байхаар зохиогдсон, нууц биш. */
  emailjs: {
    publicKey: '',   // Account → General → Public Key
    serviceId: '',   // Email Services → Service ID
    templateId: ''   // Email Templates → Template ID
  },

  /* SMS: Make.com, Zapier эсвэл өөрийн серверийн webhook хаяг.
     Сайт энэ хаяг руу JSON илгээнэ. Webhook нь SMS үйлчилгээгээр мессеж явуулна. */
  webhookUrl: '',

  /* Нэг хэрэглэгчээс дараалан ирсэн мессеж бүрт мэдэгдэл явуулахгүй.
     Сэтгэл зүйч хариулаагүй байхад дахин мэдэгдэх хамгийн бага зай (минутаар). */
  throttleMinutes: 15
};
