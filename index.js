import express from "express";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import session from "express-session";
import MongoStore from "connect-mongo";
import bcrypt from "bcrypt";
import multer from "multer";
import { Blog } from "./models/blogModel.js";
import { User } from "./models/userModel.js";
import { fileURLToPath } from "url";

dotenv.config(); // Load environment variables from .env file
const app = express();
const port = 3000;
const saltRounds = 12; // Define the complexity of the hash

// Creating Node.js globals for filename and dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connecting to Database
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Ensure the uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
fs.existsSync(uploadsDir) || fs.mkdirSync(uploadsDir, { recursive: true });

// Multer Middleware
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

// Initialize Multer
const upload = multer({ storage: storage });

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// a) user session Middleware
app.use(
  session({
    secret: process.env.SESSION_KEY, // .env variable
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: { maxAge: 180 * 60 * 1000 }, // Session expiration: 180 minutes
  })
);

// b) loggin check Middleware
app.use((req, res, next) => {
  res.locals.loggedIn = req.session.userId ? true : false;
  next();
});

// c) authenticated user permission Middleware
function ensureAuthenicated(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.redirect("/login");
  }
}

// Routes
app.get("/", async (req, res) => {
  let { page = 1, limit = 4 } = req.query; // Default to page 1 and 4 posts per page if not provided
  page = parseInt(page);
  limit = parseInt(limit);

  try {
    // Calculate the total number of documents
    const totalDocs = await Blog.countDocuments();
    const totalPages = Math.ceil(totalDocs / limit); // Skip the previous pages' posts
    const blogs = await Blog.find()
      .skip((page - 1) * limit)
      .limit(limit); // Limit the number of posts

    res.render("index", { blogs, currentPage: page, totalPages });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

// Route for CREATING Blogs
app.get("/create-blog", ensureAuthenicated, (req, res) => {
  res.render("create.ejs", { blog: null });
});

// Route for POSTING Blogs
app.post(
  "/create-blog",
  ensureAuthenicated,
  upload.single("image"),
  async (req, res) => {
    try {
      const currentUser = await User.findById(req.session.userId);
      // Initialize imagePath as an empty string if no file is uploaded
      let webImagePath = "";

      // If an image is uploaded, construct the web-friendly path
      if (req.file) {
        // Extract the filename from the uploaded file
        const filename = req.file.filename;
        // Construct the web-friendly path
        webImagePath = `/uploads/${filename}`;
      }

      const newBlog = await Blog.create({
        ...req.body,
        author: currentUser.username,
        imagePath: webImagePath,
      });

      res.redirect(`/blog/${newBlog._id}`);
    } catch (error) {
      res.status(500).json({
        Status: "Error",
        Message: error,
      });
    }
  }
);

// Route to get login page
app.get("/login", (req, res) => {
  res.render("login.ejs");
});

// Route to login user
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    const isMatch = await bcrypt.compare(password, user.password);

    if (!user) {
      // User email not found
      res.render("login", { errorMessage: "Email does not exist." });
    } else if (!isMatch) {
      // User password not valid
      res.render("login", { errorMessage: "Invalid password." });
    } else if (isMatch) {
      // User found, proceed to "log in"
      req.session.userId = user._id; // Use user's ID to manage session
      req.session.name = user.username; // Use user's email for blog verification
      res.redirect("/"); // Redirect to home page or user dashboard
    }
  } catch (error) {
    res.render("login", {
      errorMessage: "An error occurred. Please try again.",
    });
  }
});

// Route to GET Signup Page
app.get("/signup", (req, res) => {
  res.render("signup.ejs");
});

app.post("/signup", async (req, res) => {
  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(req.body.password, saltRounds);

    const newUser = await User.create({
      ...req.body,
      password: hashedPassword,
    });
    res.render("login.ejs");
  } catch (error) {
    res.status(500).json({
      Status: "Error",
      Message: error,
    });
  }
});

// Route for SPECIFIC Blog
app.get("/blog/:blogID", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.blogID);
    const username = req.session.name;
    res.render("blog.ejs", { blog, username });
  } catch (error) {
    res.status(404).json({
      Status: "Error",
      Message: "Blog post not found.",
    });
  }
});

app.get("/blog/delete/:blogID", ensureAuthenicated, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.blogID);
    if (req.session.name === blog.author) {
      await Blog.findByIdAndDelete(req.params.blogID);
      res.redirect("/");
    } else {
      res.status(403).json({
        Status: "Error",
        Message: "You do not have permision to do this.",
      });
    }
  } catch (error) {
    res.status(500).json({
      Status: "Error",
      Message: error,
    });
  }
});

app.get("/edit/:blogID", ensureAuthenicated, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.blogID);
    if (req.session.name === blog.author) {
      res.render("create.ejs", { blog });
    } else {
      res.status(403).json({
        Status: "Error",
        Message: "You do not have permision to do this.",
      });
    }
  } catch (error) {
    res.status(500).json({
      Status: "Error",
      Message: error,
    });
  }
});

app.post(
  "/edit/:blogID",
  ensureAuthenicated,
  upload.single("image"),
  async (req, res) => {
    try {
      const blog = await Blog.findById(req.params.blogID);
      if (req.session.name === blog.author) {
        let webImagePath = blog.imagePath; // Default to existing imagePath

        // If an image is uploaded, update the web-friendly path
        if (req.file) {
          const filename = req.file.filename;
          webImagePath = `/uploads/${filename}`;
        }

        const updatedBlog = await Blog.findOneAndReplace(
          { _id: req.params.blogID },
          {
            ...req.body,
            author: req.session.name, // Assuming this is the correct username
            imagePath: webImagePath,
          },
          { new: true } // This option doesn't apply to findOneAndReplace; consider findByIdAndUpdate if needed
        );
        res.redirect(`/blog/${req.params.blogID}`); // Redirect to the updated blog post
      } else {
        res.status(403).json({
          Status: "Error",
          Message: "You do not have permission to do this.",
        });
      }
    } catch (error) {
      res.status(500).json({
        Status: "Error",
        Message: error,
      });
    }
  }
);

// Route for user logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
