const express = require('express');
const cors = require('cors');
require('dotenv').config()
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;

//middleware
app.use(cors({
  origin: ['http://localhost:5173'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

const admin = require("firebase-admin");
const serviceAccount = require("./firebase-admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


const logger = (req, res, next) => {
  // console.log("inside the logger middleware");

  next();
}

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  // console.log(token);
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access' })
  }
  jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized access" })
    }
    req.decoded = decoded;

    next();
  })
}

const verifyEmail = (req, res, next) => {
  const email = req.query.email;
  const tokenEmail = req.decoded.email;
  if (email !== tokenEmail) {
    return res.status(403).send({ message: "Forbidden access" })
  }
  next();
}


const verifyFirebaseToken = async (req, res, next) => {
  const authInfo = req.headers?.authorization;
  const token = authInfo.split(' ')[1];
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" })
  }

  const userInfo = await admin.auth().verifyIdToken(token);
  req.tokenEmail = userInfo.email;
  next();

}



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oo7po89.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    //collections
    const jobsCollection = client.db("careerCode").collection("jobs")
    const applicationsCollection = client.db('careerCode').collection("applications")


    // JWT related api 
    app.post('/jwt', async (req, res) => {
      const email = req.body
      const token = jwt.sign(email, process.env.JWT_ACCESS_SECRET, { expiresIn: '1d' })
      // console.log(token);

      // token set to the cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: false
      })

      res.send({ success: true })
    })


    //job api
    app.get('/jobs', async (req, res) => {

      const email = req.query.email;
      const query = {};
      if (email) {
        query.hr_email = email;
      }

      const cursor = jobsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    })

    app.get('/jobs/applications', verifyToken, verifyEmail, async (req, res) => {
      const email = req.query.email;
      const query = { hr_email: email }
      const jobs = await jobsCollection.find(query).toArray();


      for (const job of jobs) {
        const applicationQuery = { jobId: job._id.toString() }
        const application_count = await applicationsCollection.countDocuments(applicationQuery)
        job.application_count = application_count;

      }
      res.send(jobs)

    })

    app.get('/jobs/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await jobsCollection.findOne(query)
      res.send(result)
    })

    app.post('/jobs', async (req, res) => {
      const newJob = req.body
      const result = await jobsCollection.insertOne(newJob);
      res.send(result)
    })

    //applicant api
    app.get('/application', logger, verifyFirebaseToken, async (req, res) => {
      const email = req.query.email;

      if (req.tokenEmail !== email) {
        return res.status(403).send({ message: 'forbidden' })
      }

      const query = { applicant: email };
      const result = await applicationsCollection.find(query).toArray()

      //bad way to aggregate data 
      for (application of result) {
        const jobId = application.jobId
        const jobQuery = { _id: new ObjectId(jobId) }
        const job = await jobsCollection.findOne(jobQuery);
        application.company = job.company;
        application.title = job.title;
        application.company_logo = job.company_logo;
      }
      res.send(result);
    })

    app.get('/application/job/:job_id', async (req, res) => {
      const job_id = req.params.job_id;
      const query = { jobId: job_id }
      const result = await applicationsCollection.find(query).toArray();
      res.send(result)
    })


    app.post('/application', async (req, res) => {
      const application = req.body;
      const result = await applicationsCollection.insertOne(application);
      res.send(result)

    })

    app.patch('/application/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          status: req.body.status
        }
      };
      const result = await applicationsCollection.updateOne(filter, updatedDoc);
      res.send(result)
    })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send("hello world")
})

app.listen(port, () => {
  console.log(`career code server is running on port ${port}`);

})

