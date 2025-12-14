/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './pages/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
        './app/**/*.{js,ts,jsx,tsx,mdx}',
        '../../packages/ui/src/**/*.{ts,tsx}'
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['var(--font-poppins)'],
                space: ['var(--font-space-grotesk)'],
            },
        },
    },
    plugins: [],
}
