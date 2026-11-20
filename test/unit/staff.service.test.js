require("dotenv").config();
const prisma = require("../../src/utils/prisma.client");
const staffService = require("../../src/services/staff.service");

describe("StaffService - Recruitment, Applications & Team Management", () => {
  const tenantId = "t-100";

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("create", () => {
    it("should create staff and associate multiple services", async () => {
      const mockStaff = {
        id: "staff-1",
        tenantId,
        name: "Pooja Verma",
        roleTitle: "Senior Hair Stylist",
        email: "pooja@example.com",
        phone: "+91 98765 43210",
        bio: "Specialist in bridal makeovers",
        isActive: true,
      };

      jest.spyOn(prisma.staff, "create").mockResolvedValue(mockStaff);
      jest.spyOn(prisma.staffService, "createMany").mockResolvedValue({ count: 2 });

      const result = await staffService.create(tenantId, {
        name: "Pooja Verma",
        roleTitle: "Senior Hair Stylist",
        email: "pooja@example.com",
        phone: "+91 98765 43210",
        bio: "Specialist in bridal makeovers",
        serviceIds: ["svc-1", "svc-2"],
      });

      expect(result.id).toBe("staff-1");
      expect(prisma.staff.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          name: "Pooja Verma",
          roleTitle: "Senior Hair Stylist",
        }),
      });
      expect(prisma.staffService.createMany).toHaveBeenCalledWith({
        data: [
          { staffId: "staff-1", serviceId: "svc-1" },
          { staffId: "staff-1", serviceId: "svc-2" },
        ],
        skipDuplicates: true,
      });
    });

    it("should create staff without serviceIds if not provided", async () => {
      const mockStaff = {
        id: "staff-2",
        tenantId,
        name: "Amit Kumar",
        roleTitle: "Receptionist",
        isActive: true,
      };

      jest.spyOn(prisma.staff, "create").mockResolvedValue(mockStaff);
      jest.spyOn(prisma.staffService, "createMany").mockResolvedValue({ count: 0 });

      const result = await staffService.create(tenantId, {
        name: "Amit Kumar",
        roleTitle: "Receptionist",
      });

      expect(result.id).toBe("staff-2");
      expect(prisma.staffService.createMany).not.toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    it("should filter by isActive: true by default", async () => {
      jest.spyOn(prisma.staff, "findMany").mockResolvedValue([{ id: "s-1", name: "Priya" }]);

      const res = await staffService.findAll(tenantId);
      expect(res).toHaveLength(1);
      expect(prisma.staff.findMany).toHaveBeenCalledWith({
        where: { tenantId, isActive: true },
        include: { staffServices: { include: { service: true } } },
        orderBy: { name: "asc" },
      });
    });

    it("should include inactive staff if includeInactive is true", async () => {
      jest.spyOn(prisma.staff, "findMany").mockResolvedValue([
        { id: "s-1", name: "Priya", isActive: true },
        { id: "s-2", name: "Rahul", isActive: false },
      ]);

      const res = await staffService.findAll(tenantId, true);
      expect(res).toHaveLength(2);
      expect(prisma.staff.findMany).toHaveBeenCalledWith({
        where: { tenantId },
        include: { staffServices: { include: { service: true } } },
        orderBy: { name: "asc" },
      });
    });
  });

  describe("findOne", () => {
    it("should return staff member if found", async () => {
      jest.spyOn(prisma.staff, "findFirst").mockResolvedValue({ id: "s-1", tenantId, name: "Priya" });

      const res = await staffService.findOne(tenantId, "s-1");
      expect(res.name).toBe("Priya");
    });

    it("should throw 404 if staff not found", async () => {
      jest.spyOn(prisma.staff, "findFirst").mockResolvedValue(null);

      await expect(staffService.findOne(tenantId, "non-existent")).rejects.toThrow("Staff not found");
    });
  });

  describe("update", () => {
    it("should update staff fields and replace assigned services", async () => {
      jest.spyOn(staffService, "findOne").mockResolvedValue({ id: "s-1", tenantId });
      jest.spyOn(prisma.staff, "update").mockResolvedValue({ id: "s-1", name: "Priya Sharma" });
      jest.spyOn(prisma.staffService, "deleteMany").mockResolvedValue({ count: 1 });
      jest.spyOn(prisma.staffService, "createMany").mockResolvedValue({ count: 1 });

      const res = await staffService.update(tenantId, "s-1", {
        name: "Priya Sharma",
        serviceIds: ["svc-3"],
      });

      expect(res.name).toBe("Priya Sharma");
      expect(prisma.staffService.deleteMany).toHaveBeenCalledWith({ where: { staffId: "s-1" } });
      expect(prisma.staffService.createMany).toHaveBeenCalledWith({
        data: [{ staffId: "s-1", serviceId: "svc-3" }],
        skipDuplicates: true,
      });
    });
  });

  describe("deactivate and activate", () => {
    it("should deactivate staff member", async () => {
      jest.spyOn(staffService, "findOne").mockResolvedValue({ id: "s-1", tenantId });
      jest.spyOn(prisma.staff, "update").mockResolvedValue({ id: "s-1", isActive: false });

      const res = await staffService.deactivate(tenantId, "s-1");
      expect(res.isActive).toBe(false);
      expect(prisma.staff.update).toHaveBeenCalledWith({
        where: { id: "s-1" },
        data: { isActive: false },
      });
    });

    it("should activate staff member", async () => {
      jest.spyOn(staffService, "findOne").mockResolvedValue({ id: "s-1", tenantId });
      jest.spyOn(prisma.staff, "update").mockResolvedValue({ id: "s-1", isActive: true });

      const res = await staffService.activate(tenantId, "s-1");
      expect(res.isActive).toBe(true);
      expect(prisma.staff.update).toHaveBeenCalledWith({
        where: { id: "s-1" },
        data: { isActive: true },
      });
    });
  });

  describe("applyForStaff (Job Application Submission)", () => {
    it("should validate and create a pending staff application", async () => {
      const mockApp = {
        id: "app-1",
        tenantId,
        applicantName: "Sunil Verma",
        email: "sunil@gmail.com",
        phone: "+91 9898989898",
        roleTitle: "Senior Physiotherapist",
        experience: "6 years clinical experience",
        coverNote: "Interested in full-time role",
        status: "PENDING",
      };

      jest.spyOn(prisma.staffApplication, "create").mockResolvedValue(mockApp);

      const res = await staffService.applyForStaff(tenantId, {
        applicantName: "Sunil Verma",
        email: "sunil@gmail.com",
        phone: "+91 9898989898",
        roleTitle: "Senior Physiotherapist",
        experience: "6 years clinical experience",
        coverNote: "Interested in full-time role",
      });

      expect(res.id).toBe("app-1");
      expect(res.status).toBe("PENDING");
      expect(prisma.staffApplication.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          applicantName: "Sunil Verma",
          email: "sunil@gmail.com",
          phone: "+91 9898989898",
          roleTitle: "Senior Physiotherapist",
          experience: "6 years clinical experience",
          coverNote: "Interested in full-time role",
          status: "PENDING",
        },
      });
    });

    it("should reject application if required fields are missing", async () => {
      await expect(
        staffService.applyForStaff(null, { applicantName: "Sunil", email: "s@g.com", roleTitle: "Stylist" })
      ).rejects.toThrow("tenantId is required");

      await expect(
        staffService.applyForStaff(tenantId, { applicantName: "", email: "s@g.com", roleTitle: "Stylist" })
      ).rejects.toThrow("Applicant Name is required");

      await expect(
        staffService.applyForStaff(tenantId, { applicantName: "Sunil", email: "", roleTitle: "Stylist" })
      ).rejects.toThrow("Email is required");

      await expect(
        staffService.applyForStaff(tenantId, { applicantName: "Sunil", email: "s@g.com", roleTitle: "" })
      ).rejects.toThrow("Role Title is required");
    });
  });

  describe("getApplications", () => {
    it("should return applications for tenant", async () => {
      jest.spyOn(prisma.staffApplication, "findMany").mockResolvedValue([{ id: "app-1", status: "PENDING" }]);

      const res = await staffService.getApplications(tenantId);
      expect(res).toHaveLength(1);
      expect(prisma.staffApplication.findMany).toHaveBeenCalledWith({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      });
    });

    it("should filter applications by status if provided", async () => {
      jest.spyOn(prisma.staffApplication, "findMany").mockResolvedValue([{ id: "app-1", status: "PENDING" }]);

      await staffService.getApplications(tenantId, "PENDING");
      expect(prisma.staffApplication.findMany).toHaveBeenCalledWith({
        where: { tenantId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
      });
    });
  });

  describe("acceptApplication (Hiring Pipeline)", () => {
    it("should create staff record, assign services, and mark application ACCEPTED", async () => {
      const mockApp = {
        id: "app-10",
        tenantId,
        applicantName: "Ritu Sharma",
        email: "ritu@salon.com",
        phone: "+91 88888 88888",
        roleTitle: "Senior Esthetician",
        experience: "4 years",
        coverNote: "Excited to join",
        status: "PENDING",
      };

      const mockStaff = {
        id: "staff-hired-1",
        tenantId,
        name: "Ritu Sharma",
        roleTitle: "Lead Esthetician",
        email: "ritu@salon.com",
        phone: "+91 88888 88888",
        bio: "Lead Esthetician with 4 years. Excited to join",
        isActive: true,
      };

      jest.spyOn(prisma.staffApplication, "findFirst").mockResolvedValue(mockApp);
      jest.spyOn(prisma.staff, "create").mockResolvedValue(mockStaff);
      jest.spyOn(prisma.staffService, "createMany").mockResolvedValue({ count: 2 });
      jest.spyOn(prisma.staffApplication, "update").mockResolvedValue({ ...mockApp, status: "ACCEPTED" });

      const result = await staffService.acceptApplication(tenantId, "app-10", {
        serviceIds: ["svc-1", "svc-2"],
        roleTitle: "Lead Esthetician",
        notes: "Great interview, offered position",
      });

      expect(result.id).toBe("staff-hired-1");
      expect(prisma.staff.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          name: "Ritu Sharma",
          roleTitle: "Lead Esthetician",
          email: "ritu@salon.com",
          phone: "+91 88888 88888",
          isActive: true,
        }),
      });
      expect(prisma.staffService.createMany).toHaveBeenCalledWith({
        data: [
          { staffId: "staff-hired-1", serviceId: "svc-1" },
          { staffId: "staff-hired-1", serviceId: "svc-2" },
        ],
        skipDuplicates: true,
      });
      expect(prisma.staffApplication.update).toHaveBeenCalledWith({
        where: { id: "app-10" },
        data: {
          status: "ACCEPTED",
          ownerNotes: "Great interview, offered position",
        },
      });
    });

    it("should throw 404 if application does not exist", async () => {
      jest.spyOn(prisma.staffApplication, "findFirst").mockResolvedValue(null);

      await expect(
        staffService.acceptApplication(tenantId, "non-existent")
      ).rejects.toThrow("Application not found");
    });

    it("should throw 400 if application was already accepted", async () => {
      jest.spyOn(prisma.staffApplication, "findFirst").mockResolvedValue({
        id: "app-10",
        tenantId,
        status: "ACCEPTED",
      });

      await expect(
        staffService.acceptApplication(tenantId, "app-10")
      ).rejects.toThrow("Application is already accepted");
    });
  });

  describe("rejectApplication", () => {
    it("should update application status to REJECTED with notes", async () => {
      jest.spyOn(prisma.staffApplication, "findFirst").mockResolvedValue({
        id: "app-20",
        tenantId,
        status: "PENDING",
      });
      jest.spyOn(prisma.staffApplication, "update").mockResolvedValue({
        id: "app-20",
        status: "REJECTED",
        ownerNotes: "Position filled",
      });

      const res = await staffService.rejectApplication(tenantId, "app-20", "Position filled");
      expect(res.status).toBe("REJECTED");
      expect(prisma.staffApplication.update).toHaveBeenCalledWith({
        where: { id: "app-20" },
        data: {
          status: "REJECTED",
          ownerNotes: "Position filled",
        },
      });
    });

    it("should throw 404 if application not found", async () => {
      jest.spyOn(prisma.staffApplication, "findFirst").mockResolvedValue(null);

      await expect(
        staffService.rejectApplication(tenantId, "missing-app", "Note")
      ).rejects.toThrow("Application not found");
    });
  });
});
