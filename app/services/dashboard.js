import { useEffect } from "react";
import { useSessionToken } from "../utils/sessionToken";
import { api } from "../services/api";

export default function Dashboard() {

  const getToken = useSessionToken();

  useEffect(() => {

    async function load() {

      const token = await getToken();

      const data = await api(
        "/dashboard/stats",
        token
      );

      console.log(data);

    }

    load();

  }, []);

  return <>Dashboard</>;
}