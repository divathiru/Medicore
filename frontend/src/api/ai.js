import { apiClient } from './client.js'

export const aiApi = {
  chatPublic: (question) =>
    apiClient.post('/ai/chat/public', { question }).then((r) => r.data),
}
