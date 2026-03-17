import './globals.css'
import PasswordChangeModal from '@/components/PasswordChangeModal'

export const metadata = {
  title: 'Helkrypt AI',
  description: 'AI-drevet kundeserviceplattform',
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
