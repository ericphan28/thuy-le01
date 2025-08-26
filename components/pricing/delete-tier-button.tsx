'use client'

interface DeleteTierButtonProps {
  tierId: number
  deleteTier: (formData: FormData) => Promise<void>
}

export default function DeleteTierButton({ tierId, deleteTier }: DeleteTierButtonProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!confirm('Bạn có chắc muốn xóa bậc số lượng này?')) {
      e.preventDefault()
    }
  }

  return (
    <form action={deleteTier} className="inline">
      <input type="hidden" name="tier_id" value={tierId} />
      <button 
        type="submit" 
        className="text-xs px-2 py-1 rounded border border-destructive text-destructive hover:bg-destructive/10"
        onClick={handleClick}
      >
        🗑️ Xóa
      </button>
    </form>
  )
}
