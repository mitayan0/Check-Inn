/** @type {import('tailwindcss').Config} */
export default {
    content: ['./src/**/*.{html,js,svelte,ts}'],
    theme: {
        extend: {
            colors: {
                // Material 3 / Google inspired palette
                primary: '#6750A4',
                'on-primary': '#FFFFFF',
                'primary-container': '#EADDFF',
                'on-primary-container': '#21005D',
                secondary: '#625B71',
                'on-secondary': '#FFFFFF',
                background: '#FEF7FF',
                surface: '#FEF7FF',
                'surface-variant': '#E7E0EC',
            },
            borderRadius: {
                '2xl': '28px', // Requested 28px radius
            }
        },
    },
    plugins: [],
}
