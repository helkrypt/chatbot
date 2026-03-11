import './globals.css'
import PasswordChangeModal from '@/components/PasswordChangeModal'

export const metadata = {
  title: 'Elesco Kundeservice',
  description: 'Admin dashboard for Elesco Trondheim kundeservice',
}

export default function RootLayout({ children }) {
  return (
    <html lang="no" suppressHydrationWarning>
      <body>
        <PasswordChangeModal />
        {children}
      </body>
    </html>
  )
}
