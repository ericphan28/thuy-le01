import { redirect } from "next/navigation"

export default async function VolumeTiersPage() {
  // Redirect to enhanced version
  redirect('/dashboard/pricing/tiers/enhanced')
}
