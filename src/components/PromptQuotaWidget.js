'use client'
import { useEffect, useState } from 'react'

export default function PromptQuotaWidget({ clientId }) {
    const [quota, setQuota] = useState(null)

    useEffect(() => {
        if (!clientId) return
        fetch(`/api/billing/quota-status?clientId=${clientId}`)
            .then(r => r.json())
            .then(data => {
                if (!data.error) setQuota(data)
            })
            .catch(() => {})
    }, [clientId])

    if (!quota) return null

    const pct = Math.min((quota.usageCount / quota.included) * 100, 100)
    const isOver = quota.usageCount >= quota.included

    return (
        <div style={{
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '16px',
            background: 'var(--surface)',
            marginTop: '16px'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>
                    Prompt-endringer denne måneden
                </span>
                <span style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: isOver ? '#dc2626' : 'var(--text-muted)'
                }}>
                    {quota.usageCount} / {quota.included}
                </span>
            </div>
            <div style={{
                width: '100%',
                background: 'var(--border)',
                borderRadius: '9999px',
                height: '6px',
                overflow: 'hidden'
            }}>
                <div style={{
                    height: '6px',
                    borderRadius: '9999px',
                    width: `${pct}%`,
                    background: isOver ? '#dc2626' : '#16a34a',
                    transition: 'width 0.3s ease'
                }} />
            </div>
            {isOver && (
                <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '6px' }}>
                    Overforbruk faktureres automatisk ({Math.round(quota.overagePrice / 100)} kr eks. mva per endring)
                </p>
            )}
        </div>
    )
}
