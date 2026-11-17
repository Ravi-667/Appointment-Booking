const { validate } = require("../../src/middlewares/validate.middleware");
const { z } = require("zod");

describe("Validate Middleware", () => {
  const schema = z.object({
    name: z.string().min(2),
    age: z.number().int().positive(),
  });

  it("should call next() when payload is valid", () => {
    const req = { body: { name: "Alice", age: 30 } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    const middleware = validate(schema);
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.body).toEqual({ name: "Alice", age: 30 });
  });

  it("should return 400 when validation fails", () => {
    const req = { body: { name: "A", age: -5 } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    const middleware = validate(schema);
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: "Validation failed",
        errors: expect.any(Array),
      })
    );
  });
});
