var User = require('../models/user');
var Task = require('../models/task');
module.exports = function(router) {
    var usersRoute = router.route('/users');
    var userRoute = router.route('/users/:id');

      // GET /api/users
    usersRoute.get(function(req, res) {
        var query = {};
        var options = {};
        console.log("Received GET /api/users with query:", req.query);

        // Parse query parameters
        if (req.query.where) {
            try {
                query = JSON.parse(req.query.where);
            } catch (e) {
                return res.status(400).json({
                    message: "Invalid where parameter",
                    data: {}
                });
            }
        }

        // Build mongoose query
        var mongooseQuery = User.find(query);

        // Apply select
        if (req.query.select) {
            try {
                var select = JSON.parse(req.query.select);
                mongooseQuery = mongooseQuery.select(select);
            } catch (e) {
                return res.status(400).json({
                    message: "Invalid select parameter",
                    data: {}
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
                    data: {}
                });
            }
        }

        // Apply skip
        if (req.query.skip) {
            var skip = parseInt(req.query.skip);
            if (isNaN(skip) || skip < 0) {
                return res.status(400).json({
                    message: "Invalid skip parameter",
                    data: {}
                });
            }
            mongooseQuery = mongooseQuery.skip(skip);
        }

        // Apply limit (no default limit for users)
        if (req.query.limit) {
            var limit = parseInt(req.query.limit);
            if (isNaN(limit) || limit < 0) {
                return res.status(400).json({
                    message: "Invalid limit parameter",
                    data: {}
                });
            }
            mongooseQuery = mongooseQuery.limit(limit);
        }

        // Handle count
        if (req.query.count === 'true') {
            User.countDocuments(query, function(err, count) {
                if (err) {
                    return res.status(500).json({
                        message: "Server error occurred",
                        data: {}
                    });
                }
                res.status(200).json({
                    message: "OK",
                    data: count
                });
            });
        } else {
            mongooseQuery.exec(function(err, users) {

                console.log("Users found:", users);
                if (err) {
                    return res.status(500).json({
                        message: "Server error occurred",
                        data: {}
                    });
                }
                res.status(200).json({
                    message: "OK",
                    data: users
                });
            });
        }
    });

    
    // POST /api/users
    usersRoute.post(function(req, res) {
        var user = new User();
        
        // Validate required fields
        if (!req.body.name || !req.body.email) {
            return res.status(400).json({
                message: "Name and email are required",
                data: {}
            });
        }

        user.name = req.body.name;
        user.email = req.body.email;
        user.pendingTasks = req.body.pendingTasks || [];

        user.save(function(err, savedUser) {
            if (err) {
                if (err.code === 11000) {
                    return res.status(400).json({
                        message: "User with this email already exists",
                        data: {}
                    });
                }
                return res.status(500).json({
                    message: "Server error occurred",
                    data: {}
                });
            }
            res.status(201).json({
                message: "User created successfully",
                data: savedUser
            });
        });
    });

      // GET /api/users/:id
    userRoute.get(function(req, res) {
        var query = User.findById(req.params.id);

        // Apply select
        if (req.query.select) {
            try {
                var select = JSON.parse(req.query.select);
                query = query.select(select);
            } catch (e) {
                return res.status(400).json({
                    message: "Invalid select parameter",
                    data: {}
                });
            }
        }

        query.exec(function(err, user) {
            if (err) {
                return res.status(500).json({
                    message: "Server error occurred",
                    data: {}
                });
            }
            if (!user) {
                return res.status(404).json({
                    message: "User not found",
                    data: {}
                });
            }
            res.status(200).json({
                message: "OK",
                data: user
            });
        });
    });

       // PUT /api/users/:id
    userRoute.put(function(req, res) {
        // Validate required fields
        if (!req.body.name || !req.body.email) {
            return res.status(400).json({
                message: "Name and email are required",
                data: {}
            });
        }

        User.findById(req.params.id, function(err, user) {
            if (err) {
                return res.status(500).json({
                    message: "Server error occurred",
                    data: {}
                });
            }
            if (!user) {
                return res.status(404).json({
                    message: "User not found",
                    data: {}
                });
            }

            // Store old pending tasks for cleanup
            var oldPendingTasks = user.pendingTasks || [];
            
            // Update user fields
            user.name = req.body.name;
            user.email = req.body.email;
            user.pendingTasks = req.body.pendingTasks || [];

            user.save(function(err, updatedUser) {
                if (err) {
                    if (err.code === 11000) {
                        return res.status(400).json({
                            message: "User with this email already exists",
                            data: {}
                        });
                    }
                    return res.status(500).json({
                        message: "Server error occurred",
                        data: {}
                    });
                }

                // Update task assignments - remove from old tasks
                Task.updateMany(
                    { _id: { $in: oldPendingTasks }, assignedUser: req.params.id },
                    { assignedUser: "", assignedUserName: "unassigned" },
                    function(err) {
                        if (err) {
                            console.error("Error updating old tasks:", err);
                        }
                    }
                );

                // Update task assignments - add to new tasks
                if (user.pendingTasks.length > 0) {
                    Task.updateMany(
                        { _id: { $in: user.pendingTasks } },
                        { assignedUser: req.params.id, assignedUserName: user.name },
                        function(err) {
                            if (err) {
                                console.error("Error updating new tasks:", err);
                            }
                        }
                    );
                }

                res.status(200).json({
                    message: "User updated successfully",
                    data: updatedUser
                });
            });
        });
    });


    
    // DELETE /api/users/:id
    userRoute.delete(function(req, res) {
        User.findById(req.params.id, function(err, user) {
            if (err) {
                return res.status(500).json({
                    message: "Server error occurred",
                    data: {}
                });
            }
            if (!user) {
                return res.status(404).json({
                    message: "User not found",
                    data: {}
                });
            }

            // Unassign all tasks from this user
            Task.updateMany(
                { assignedUser: req.params.id },
                { assignedUser: "", assignedUserName: "unassigned" },
                function(err) {
                    if (err) {
                        return res.status(500).json({
                            message: "Server error occurred while updating tasks",
                            data: {}
                        });
                    }

                    // Delete the user
                    User.findByIdAndDelete(req.params.id, function(err) {
                        if (err) {
                            return res.status(500).json({
                                message: "Server error occurred",
                                data: {}
                            });
                        }
                        res.status(204).send();
                    });
                }
            );
        });
        
    });



  return router;
}