'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function BannerInner({ clientId, clientName }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isInspecting = searchParams.get('inspect') === 'true'

  if (!isInspecting) return null

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 9999,
      background: '#f59e0b',
      color: '#1c1107',
      padding: '10px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: '14px',
      fontWeight: '600',
      borderBottom: '2px solid #d97706',
      boxShadow: '0 2px 8px rgba(245,158,11,0.4)',
    }}>
      <span>
        Inspeksjonsmodus — {clientName || clientId}
      </span>
      <button
        onClick={() => router.push(`/admin/clients/${clientId}`)}
        style={{
          padding: '6px 16px',
          background: '#1c1107',
          color: '#f59e0b',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: '600',
          fontSize: '13px',
        }}
      >
        Avslutt inspeksjon
      </button>
    </div>
  )
}

export default function InspectBanner({ clientId, clientName }) {
  return (
    <Suspense fallback={null}>
      <BannerInner clientId={clientId} clientName={clientName} />
    </Suspense>
  )
}
