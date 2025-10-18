var Task = require("../models/task");
var User = require("../models/user");
module.exports = function (router) {
  var tasksRoute = router.route("/tasks");
  var taskRoute = router.route("/tasks/:id");

    // GET /api/tasks
  tasksRoute.get(function (req, res) {
    var query = {};

    // Parse query parameters
    if (req.query.where) {
      try {
        query = JSON.parse(req.query.where);
      } catch (e) {
        return res.status(400).json({
          message: "Invalid where parameter",
          data: {},
        });
      }
    }

    // Build mongoose query
    var mongooseQuery = Task.find(query);

    // Apply select
    if (req.query.select) {
      try {
        var select = JSON.parse(req.query.select);
        mongooseQuery = mongooseQuery.select(select);
      } catch (e) {
        return res.status(400).json({
          message: "Invalid select parameter",
          data: {},
        });
      }
    }

    // Apply sort
    if (req.query.sort) {
      try {
        var sort = JSON.parse(req.query.sort);
        mongooseQuery = mongooseQuery.sort(sort);
      } catch (e) {
        return res.status(400).json({
          message: "Invalid sort parameter",
          data: {},
        });
      }
    }

    // Apply skip
    if (req.query.skip) {
      var skip = parseInt(req.query.skip);
      if (isNaN(skip) || skip < 0) {
        return res.status(400).json({
          message: "Invalid skip parameter",
          data: {},
        });
      }
      mongooseQuery = mongooseQuery.skip(skip);
    }

    // Apply limit (default 100 for tasks)
    var limit = 100;
    if (req.query.limit) {
      limit = parseInt(req.query.limit);
      if (isNaN(limit) || limit < 0) {
        return res.status(400).json({
          message: "Invalid limit parameter",
          data: {},
        });
      }
    }
    mongooseQuery = mongooseQuery.limit(limit);

    // Handle count
    if (req.query.count === "true") {
      Task.countDocuments(query, function (err, count) {
        if (err) {
          return res.status(500).json({
            message: "Server error occurred",
            data: {},
          });
        }
        res.status(200).json({
          message: "OK",
          data: count,
        });
      });
    } else {
      mongooseQuery.exec(function (err, tasks) {
        if (err) {
          return res.status(500).json({
            message: "Server error occurred",
            data: {},
          });
        }
        res.status(200).json({
          message: "OK",
          data: tasks,
        });
      });
    }
  });

    // POST /api/tasks
  tasksRoute.post(function (req, res) {
    var task = new Task();

    // Validate required fields
    if (!req.body.name || !req.body.deadline) {
      return res.status(400).json({
        message: "Name and deadline are required",
        data: {},
      });
    }

    task.name = req.body.name;
    task.description = req.body.description || "";
    task.deadline = req.body.deadline;
    task.completed = req.body.completed || false;
    task.assignedUser = req.body.assignedUser || "";
    task.assignedUserName = req.body.assignedUserName || "unassigned";

    task.save(function (err, savedTask) {
      if (err) {
        return res.status(500).json({
          message: "Server error occurred",
          data: {},
        });
      }

      // If task is assigned to a user and not completed, add to user's pending tasks
      if (savedTask.assignedUser && !savedTask.completed) {
        User.findByIdAndUpdate(
          savedTask.assignedUser,
          { $addToSet: { pendingTasks: savedTask._id } },
          function (err) {
            if (err) {
              console.error("Error updating user's pending tasks:", err);
            }
          }
        );
      }

      res.status(201).json({
        message: "Task created successfully",
        data: savedTask,
      });
    });
  });


    // GET /api/tasks/:id
  taskRoute.get(function (req, res) {
    var query = Task.findById(req.params.id);

    // Apply select
    if (req.query.select) {
      try {
        var select = JSON.parse(req.query.select);
        query = query.select(select);
      } catch (e) {
        return res.status(400).json({
          message: "Invalid select parameter",
          data: {},
        });
      }
    }

    query.exec(function (err, task) {
      if (err) {
        return res.status(500).json({
          message: "Server error occurred",
          data: {},
        });
      }
      if (!task) {
        return res.status(404).json({
          message: "Task not found",
          data: {},
        });
      }
      res.status(200).json({
        message: "OK",
        data: task,
      });
    });
  });


    // PUT /api/tasks/:id
  taskRoute.put(function (req, res) {
    // Validate required fields
    if (!req.body.name || !req.body.deadline) {
      return res.status(400).json({
        message: "Name and deadline are required",
        data: {},
      });
    }

    Task.findById(req.params.id, function (err, task) {
      if (err) {
        return res.status(500).json({
          message: "Server error occurred",
          data: {},
        });
      }
      if (!task) {
        return res.status(404).json({
          message: "Task not found",
          data: {},
        });
      }

      // Store old assignment info
      var oldAssignedUser = task.assignedUser;
      var oldCompleted = task.completed;

      // Update task fields
      task.name = req.body.name;
      task.description = req.body.description || "";
      task.deadline = req.body.deadline;
      task.completed =
        req.body.completed !== undefined ? req.body.completed : false;
      task.assignedUser = req.body.assignedUser || "";
      task.assignedUserName = req.body.assignedUserName || "unassigned";

      task.save(function (err, updatedTask) {
        if (err) {
          return res.status(500).json({
            message: "Server error occurred",
            data: {},
          });
        }

        // Handle user assignment changes
        // Remove from old user's pending tasks if needed
        if (
          oldAssignedUser &&
          (oldAssignedUser !== updatedTask.assignedUser ||
            updatedTask.completed)
        ) {
          User.findByIdAndUpdate(
            oldAssignedUser,
            { $pull: { pendingTasks: req.params.id } },
            function (err) {
              if (err) {
                console.error("Error removing task from old user:", err);
              }
            }
          );
        }

        // Add to new user's pending tasks if needed
        if (
          updatedTask.assignedUser &&
          !updatedTask.completed &&
          updatedTask.assignedUser !== oldAssignedUser
        ) {
          User.findByIdAndUpdate(
            updatedTask.assignedUser,
            { $addToSet: { pendingTasks: updatedTask._id } },
            function (err) {
              if (err) {
                console.error("Error adding task to new user:", err);
              }
            }
          );
        }

        // If task was completed, remove from current user's pending tasks
        if (
          updatedTask.completed &&
          !oldCompleted &&
          updatedTask.assignedUser
        ) {
          User.findByIdAndUpdate(
            updatedTask.assignedUser,
            { $pull: { pendingTasks: req.params.id } },
            function (err) {
              if (err) {
                console.error("Error removing completed task from user:", err);
              }
            }
          );
        }

        res.status(200).json({
          message: "Task updated successfully",
          data: updatedTask,
        });
      });
    });
  });


    // DELETE /api/tasks/:id
  taskRoute.delete(function (req, res) {
    Task.findById(req.params.id, function (err, task) {
      if (err) {
        return res.status(500).json({
          message: "Server error occurred",
          data: {},
        });
      }
      if (!task) {
        return res.status(404).json({
          message: "Task not found",
          data: {},
        });
      }

      // Remove task from assigned user's pending tasks
      if (task.assignedUser) {
        User.findByIdAndUpdate(
          task.assignedUser,
          { $pull: { pendingTasks: req.params.id } },
          function (err) {
            if (err) {
              console.error("Error removing task from user:", err);
            }
          }
        );
      }

      // Delete the task
      Task.findByIdAndDelete(req.params.id, function (err) {
        if (err) {
          return res.status(500).json({
            message: "Server error occurred",
            data: {},
          });
        }
          res.status(204).send();
      });
    });
  });

  return router;
}