import { Router } from "express";
export const MainRoutes = (app) => {
    const router = Router();
    router.get("/", (_, res) => {
        res.json({
            message: "Hello World!",
        });
    });
    app.use("/api/", router);
};
//# sourceMappingURL=index.js.map