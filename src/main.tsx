import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import AppLayout from "./app";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DashboardRoute from "./routes/dashboard";
import ReviewRoute from "./routes/review";
import SettingsRoute from "./routes/settings";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardRoute /> },
      { path: "dashboard", element: <DashboardRoute /> },
      { path: "review/:sourceDocId", element: <ReviewRoute /> },
      { path: "settings", element: <SettingsRoute /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
