/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Upload des photos de profil via Server Action (max 5 Mo + marge form-data).
      bodySizeLimit: "6mb",
    },
  },
  // En-têtes de sécurité globaux. `frame-ancestors 'none'` + X-Frame-Options
  // interdisent l'embarquement en iframe (anti-clickjacking) — pertinent pour
  // les actions admin (suspendre/rejeter) déclenchables au clic sur une session
  // authentifiée. Les Server Actions Next vérifient déjà l'Origin (anti-CSRF).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
