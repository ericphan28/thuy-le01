"use client";

export default function PrintToolbar() {
  return (
    <div
      className="no-print"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 100000,
        display: 'flex',
        gap: 8,
      }}
    >
      <button
        onClick={() => window.print()}
        style={{
          padding: '8px 12px',
          border: '1px solid #222',
          background: '#fff',
          cursor: 'pointer',
          fontWeight: 600,
          borderRadius: 6,
        }}
        title="Mở hộp thoại in (Ctrl+P)"
      >
        In
      </button>
      <span style={{ fontSize: 12, color: '#555' }}>Mẹo: Nhấn Ctrl+P để mở nhanh hộp thoại in</span>
    </div>
  );
}
