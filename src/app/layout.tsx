import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tableau de bord Cabinet DG · ANSUT',
  description: 'Suivi des activités - ANSUT',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
