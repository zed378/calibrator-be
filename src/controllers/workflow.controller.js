const workflowService = require("../services/workflow.service");
const { successResponse } = require("../utils/response.util");
const { asyncHandler } = require("../utils/controllerWrapper.util");

exports.getWorkflows = asyncHandler(async (req, res) => {
  const workflows = await workflowService.getWorkflows(req.tenant.id);
  return successResponse(res, 200, "Workflows retrieved successfully", workflows);
});

exports.getWorkflowById = asyncHandler(async (req, res) => {
  const workflow = await workflowService.getWorkflowById(req.tenant.id, req.params.id);
  return successResponse(res, 200, "Workflow retrieved successfully", workflow);
});

exports.createWorkflow = asyncHandler(async (req, res) => {
  const workflow = await workflowService.createWorkflow(req.tenant.id, req.body);
  return successResponse(res, 201, "Workflow created successfully", workflow);
});

exports.updateWorkflow = asyncHandler(async (req, res) => {
  const workflow = await workflowService.updateWorkflow(req.tenant.id, req.params.id, req.body);
  return successResponse(res, 200, "Workflow updated successfully", workflow);
});

exports.deleteWorkflow = asyncHandler(async (req, res) => {
  await workflowService.deleteWorkflow(req.tenant.id, req.params.id);
  return successResponse(res, 200, "Workflow deleted successfully");
});

exports.getPendingTasks = asyncHandler(async (req, res) => {
  // Pass the whole user object because we need user.id and user.roleId
  const tasks = await workflowService.getPendingTasks(req.tenant.id, req.user);
  return successResponse(res, 200, "Pending tasks retrieved successfully", tasks);
});

exports.submitAction = asyncHandler(async (req, res) => {
  const result = await workflowService.submitAction(
    req.tenant.id,
    req.params.instanceId,
    req.user,
    req.body
  );
  return successResponse(res, 200, result.message, { status: result.status });
});
