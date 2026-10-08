import './globals.css';

export const metadata = {
  title: 'CampusCE Overview',
  description: 'CampusCE courses, students and instructors at a glance',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-surface-0 text-zinc-200 font-sans antialiased">{children}</body>
    </html>
  );
}
