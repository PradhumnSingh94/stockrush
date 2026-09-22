const isBrowser = typeof window !== "undefined";

export const AuthStorage = {
  getToken: () => (isBrowser ? localStorage.getItem("token") : null),
  setToken: (token: string) =>
    isBrowser && localStorage.setItem("token", token),
  removeToken: () => isBrowser && localStorage.removeItem("token"),
  getUser: () => {
    if (!isBrowser) return null;
    const user = localStorage.getItem("user");
    return user ? JSON.parse(user) : null;
  },
  setUser: (user: object) =>
    isBrowser && localStorage.setItem("user", JSON.stringify(user)),
  clear: () => {
    if (!isBrowser) return;
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  },
};
