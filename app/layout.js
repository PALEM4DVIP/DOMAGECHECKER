import "./globals.css";

export const metadata = {
  title: "Domain Inspector — Cek Umur, DNS & SSL Domain",
  description:
    "Alat untuk memeriksa umur domain, catatan DNS, dan sertifikat SSL secara massal.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="font-sans bg-ink text-paper antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
