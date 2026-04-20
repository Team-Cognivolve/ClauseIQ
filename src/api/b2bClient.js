async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || data?.message || 'Request failed');
  }
  return data;
}

async function b2bRequest(path, {
  method = 'GET',
  body,
  isForm = false,
  accessToken = '',
  model = '',
} = {}) {
  const headers = {
    ...(isForm ? {} : { 'Content-Type': 'application/json' }),
  };

  if (accessToken) {
    headers['x-copilot-token'] = accessToken;
  }

  if (model) {
    headers['x-copilot-model'] = model;
  }

  const response = await fetch(`/api/b2b${path}`, {
    method,
    credentials: 'include',
    headers,
    body: isForm ? body : (body ? JSON.stringify(body) : undefined),
  });

  return parseResponse(response);
}

export const b2bApi = {
  signup(payload) {
    return b2bRequest('/auth/signup', { method: 'POST', body: payload });
  },
  login(payload) {
    return b2bRequest('/auth/login', { method: 'POST', body: payload });
  },
  me() {
    return b2bRequest('/auth/me');
  },
  logout() {
    return b2bRequest('/auth/logout', { method: 'POST' });
  },
  getProfile() {
    return b2bRequest('/company/profile');
  },
  saveProfile(payload) {
    return b2bRequest('/company/profile', { method: 'POST', body: payload });
  },
  listPolicies() {
    return b2bRequest('/policies/list');
  },
  uploadPolicy(formData) {
    return b2bRequest('/policies/upload', { method: 'POST', body: formData, isForm: true });
  },
  listReviews() {
    return b2bRequest('/review/list');
  },
  getReview(reviewId) {
    return b2bRequest(`/review/${reviewId}`);
  },
  uploadContract(formData, copilot) {
    return b2bRequest('/review/upload-contract', {
      method: 'POST',
      body: formData,
      isForm: true,
      accessToken: copilot?.accessToken,
      model: copilot?.model,
    });
  },
  askQuestion(payload, copilot) {
    return b2bRequest('/chat/ask', {
      method: 'POST',
      body: payload,
      accessToken: copilot?.accessToken,
      model: copilot?.model,
    });
  },
};
