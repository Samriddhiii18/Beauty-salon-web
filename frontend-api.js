/* ====== FRONTEND API BRIDGE ======
   Connects the website to the backend server.
   If backend is unavailable, falls back to localStorage for local testing.
*/
const API = (() => {
  const BASE = window.location.origin;
  let sessionToken = localStorage.getItem('beautySalonToken') || null;
  let serverAvailable = false;

  // Check if server is reachable
  async function checkServer() {
    try {
      const resp = await fetch(BASE + '/api/reviews', { method: 'HEAD', cache: 'no-store' });
      serverAvailable = resp.ok || resp.status === 200;
    } catch {
      serverAvailable = false;
    }
    return serverAvailable;
  }

  // Call API or fall back to localStorage
  async function callAPI(endpoint, options = {}) {
    try {
      const resp = await fetch(BASE + endpoint, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      if (resp.ok) return await resp.json();
      const errData = await resp.json().catch(() => ({}));
      return { success: false, ...errData };
    } catch {
      return { success: false, _offline: true };
    }
  }

  return {
    getToken: () => sessionToken,
    setToken: (t) => { sessionToken = t; if (t) localStorage.setItem('beautySalonToken', t); else localStorage.removeItem('beautySalonToken'); },
    getServerAvailable: () => serverAvailable,
    checkServer,

    // ====== AUTH ======
    login: async (username, password, role) => {
      const result = await callAPI('/api/login', { method: 'POST', body: { username, password, role } });
      if (result.success) API.setToken(result.token);
      return result;
    },
    signup: async (username, password, role, adminCode) => {
      const result = await callAPI('/api/signup', { method: 'POST', body: { username, password, role, adminCode } });
      if (result.success) API.setToken(result.token);
      return result;
    },
    logout: async () => {
      if (sessionToken) await callAPI('/api/logout', { method: 'POST', body: { token: sessionToken } });
      API.setToken(null);
    },
    verifyToken: async () => {
      if (!sessionToken) return null;
      const result = await callAPI('/api/verify', { method: 'POST', body: { token: sessionToken } });
      if (result.success) return result;
      API.setToken(null);
      return null;
    },
    getUsers: () => callAPI('/api/users'),

    // ====== REVIEWS ======
    getReviews: () => callAPI('/api/reviews'),
    addReview: (author, rating, text) =>
      callAPI('/api/reviews', { method: 'POST', body: { token: sessionToken, author, rating, text } }),

    // ====== CALLBACK REQUESTS ======
    getRequests: () => callAPI('/api/requests'),
    addRequest: (name, phone, service, message, from) =>
      callAPI('/api/requests', { method: 'POST', body: { token: sessionToken, name, phone, service, message, from } }),

    // ====== GALLERY ======
    getGallery: () => callAPI('/api/gallery'),
    uploadGallery: async (files) => {
      const formData = new FormData();
      for (const f of files) formData.append('images', f);
      try {
        const resp = await fetch(BASE + '/api/gallery/upload', { method: 'POST', body: formData });
        if (resp.ok) return await resp.json();
        return { success: false };
      } catch { return { success: false }; }
    },
    deleteGallery: (filenames) =>
      callAPI('/api/gallery/delete', { method: 'POST', body: { filenames } }),

    // ====== OFFERS ======
    getOffers: () => callAPI('/api/offers'),
    addOffer: (category, text) =>
      callAPI('/api/offers', { method: 'POST', body: { category, text } }),
    deleteOffer: (category, index) =>
      callAPI('/api/offers/delete', { method: 'POST', body: { category, index } }),

    // ====== REWARDS ======
    getRewards: () => callAPI('/api/rewards'),
    setPointsPerService: (category, points) =>
      callAPI('/api/rewards/points-service', { method: 'POST', body: { category, points } }),
    addThreshold: (points, discount) =>
      callAPI('/api/rewards/threshold', { method: 'POST', body: { points, discount } }),
    deleteThreshold: (index) =>
      callAPI('/api/rewards/threshold/delete', { method: 'POST', body: { index } }),
    updateCustomerPoints: (username, type, points, description) =>
      callAPI('/api/rewards/customer', { method: 'POST', body: { username, type, points, description } }),
    redeemReward: (username, points, discount) =>
      callAPI('/api/rewards/redeem', { method: 'POST', body: { username, points, discount } })
  };
})();
