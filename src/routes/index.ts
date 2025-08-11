import { type Express, Router } from "express";

export const MainRoutes = (app: Express) => {
  const router = Router();

  router.get("/", (_, res) => {
    res.json({
      message: "Hello World!",
    });
  });

  app.use("/api/", router);
};
