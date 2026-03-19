'use client'

export default function CheckoutCancel() {
    return (
        <div className="login-container">
            <div className="login-card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#10060;</div>
                <h1 className="login-title">Betalingen ble avbrutt</h1>
                <p className="login-subtitle">
                    Ingen belastning har blitt gjort. Du kan prøve igjen når som helst.
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '24px' }}>
                    <a href="/" className="btn btn-primary" style={{ padding: '14px 32px' }}>
                        Prøv igjen
                    </a>
                </div>
            </div>
        </div>
    )
}
