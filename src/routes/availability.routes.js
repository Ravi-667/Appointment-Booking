const router = require("express").Router();
const availabilityService = require("../services/availability.service");

router.get("/", async (req, res, next) => {
  try {
    const { tenantId, serviceId, date, staffId } = req.query;
    if (!tenantId || !serviceId || !date) {
      return res.status(400).json({ message: "tenantId, serviceId and date are required" });
    }
    const slots = await availabilityService.getSlots(tenantId, serviceId, date, staffId);
    res.json({ date, count: slots.length, slots });
  } catch (e) { next(e); }
});

module.exports = router;

