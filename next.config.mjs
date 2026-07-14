/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Upload des photos de profil via Server Action (max 5 Mo + marge form-data).
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
