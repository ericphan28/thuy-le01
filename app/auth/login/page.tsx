import { ProfessionalLoginForm } from "@/components/professional-login-form"

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <ProfessionalLoginForm />
      </div>
    </div>
  )
}
