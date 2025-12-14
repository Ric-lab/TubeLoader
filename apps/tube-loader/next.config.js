/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    output: 'standalone',
    transpilePackages: ['@x-lab/ui'],
}

module.exports = nextConfig
