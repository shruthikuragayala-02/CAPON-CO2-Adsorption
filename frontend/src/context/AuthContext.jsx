import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "../services/api";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("mgo_user"));
    } catch {
      return null;
    }
  });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const me = await api.get("/auth/me");
        setUser(me);
        sessionStorage.setItem("mgo_user", JSON.stringify(me));
      } catch {
        try {
          const r = await api.post("/auth/refresh");
          setUser(r.user);
          sessionStorage.setItem("mgo_user", JSON.stringify(r.user));
        } catch {
          sessionStorage.removeItem("mgo_user");
          setUser(null);
        }
      }
      setReady(true);
    })();
  }, []);
  const login = async (data, developer = false) => {
    const r = await api.post(developer ? "/auth/developer-login" : "/auth/login", data);
    sessionStorage.setItem("mgo_user", JSON.stringify(r.user));
    setUser(r.user);
    return r.user;
  };
  const register = async (data) => {
    const r = await api.post("/auth/register", data);
    sessionStorage.setItem("mgo_user", JSON.stringify(r.user));
    setUser(r.user);
    return r.user;
  };
  const logout = async () => {
    try {
      await api.post("/auth/logout", {});
    } catch {}
    sessionStorage.clear();
    setUser(null);
  };
  return <AuthContext.Provider value={{ user, ready, login, register, logout }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
