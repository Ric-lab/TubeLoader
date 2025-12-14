/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    output: 'standalone',
    basePath: '/TubeLoader',
    transpilePackages: ['@x-lab/ui'],
}

module.exports = nextConfig
