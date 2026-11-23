const feedbackStatusLabels: Record<string, string> = {
  new: 'Baru',
  in_progress: 'Diproses',
  resolved: 'Selesai',
  rejected: 'Ditolak',
}

const feedbackCategoryLabels: Record<string, string> = {
  general: 'Umum',
  feature: 'Saran fitur',
  bug: 'Laporan bug',
}

export function formatUserRole(role: string | null | undefined): string {
  return role === 'admin' ? 'Admin' : 'Pengguna'
}

export function formatUserBlocked(banned: boolean): string {
  return banned ? 'Diblokir' : 'Tidak diblokir'
}

export function formatFeedbackStatus(status: string): string {
  return feedbackStatusLabels[status] ?? 'Baru'
}

export function formatFeedbackCategory(category: string): string {
  return feedbackCategoryLabels[category] ?? 'Umum'
}
