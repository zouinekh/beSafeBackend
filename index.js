const express = require("express");
const bodyParser = require("body-parser");
const { createClient } = require('@supabase/supabase-js');
const mqtt = require("mqtt");
const app = express();
const Axios = require('axios');

app.use(bodyParser.json());
let supabaseUrl = 'https://czomewedkfrdslvnezwt.supabase.co';
let supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b21ld2Vka2ZyZHNsdm5lend0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzIyMDkxMTUsImV4cCI6MjA0Nzc4NTExNX0.517fy9CmkjSYHrvJhKGgOcvQikvpMF9j-uWP3YwoAa4";
let mqttSend = true;
let maxUserValue = null
let counter = 0;
const supabase = createClient(supabaseUrl, supabaseKey);
let userConnected;

// MQTT client setup
const mqttClient = mqtt.connect("mqtt://broker.hivemq.com"); // Replace with your MQTT broker URL
mqttClient.on("connect", () => {
  console.log("Connected to MQTT broker");
});
mqttClient.on("error", (err) => {
  console.error("MQTT connection error:", err);
});

// Root route
app.get("/", (req, res) => res.send("Express server working"));

// Login route
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // First authentication check
  const { data: authData, error: errorAuth } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  console.log("object")
  console.log(errorAuth)
  if (errorAuth) {
    return res.status(400).send({
      message: "Authentications failed"
    });
  }

  // Get user data
  const { data: user, error: userError } = await supabase.from("users").select("*").eq("email", email);

  if (userError) {
    return res.status(400).send({
      message: "Error fetching user data"
    });
  }

  if (!user || user.length === 0) {
    return res.status(404).send({
      message: "User not found"
    });
  }

  userConnected = user[0];
  return res.status(200).send({
    message: "User logged in successfully",
    user: user[0]
  });
});

// Registration route
app.post("/register", async (req, res) => {
  try {
    const { username: username, email: email, password, pushNotificationToken: pushNotificationToken } = req.body;
    console.log(req.body)
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    })

    if (error) {

      console.log(error)
      return res.status(400).send({
        message: "error signup"
      });
    }
    const { error: insertingError } = await supabase.from("users").insert({
      username, email, pushNotificationToken, notificationOn: true, authId: data.user.id
    })
    if (insertingError) {
      return res.status(400).send({
        message: "error signup"
      });
    }
    userConnected = { username, email, pushNotificationToken, notificationOn: true, authId: data.user.id }
    res.status(201).send("User registered successfully.");
  } catch (error) {
    res.status(500).send(error);
  }
});

app.delete("/reset", async (req, res) => {
  const { email } = req.body
  const { data: co2Data, error: co2Error } = await supabase.from("co2Charts").delete().eq("email", email)
  const { data: so2Data, error: so2Error } = await supabase.from("so2Charts").delete().eq("email", email)
  if (co2Error || so2Error) {
    res.status(400).send({
      message: "error in deleting data"
    })
  }
  res.status(200).send({
    message: "charts rested successfully"
  })
})


app.post("/dashboard", async (req, res) => {
  const { email } = req.body
  const { data: co2ChartsPerDay, error: err } = await supabase.from("co2Charts").select('number').eq("interval", "days").limit(7).eq("email", email).order('created_at', { ascending: false })
  const { data: co2ChartsPerMin, error: errMin } = await supabase.from("co2Charts").select('number').eq("interval", "min").limit(15).eq("email", email).order('created_at', { ascending: false })
  const { data: co2ChartsPerHours, error: errHours } = await supabase.from("co2Charts").select('number').eq("interval", "hour").limit(12).eq("email", email).order('created_at', { ascending: false })
  //so2
  const { data: so2ChartsPerDay, error: so2err } = await supabase.from("so2Charts").select('number').eq("interval", "days").limit(7).eq("email", email).order('created_at', { ascending: false })
  const { data: so2ChartsPerMin, error: so2errMin } = await supabase.from("so2Charts").select('number').eq("interval", "min").limit(15).eq("email", email).order('created_at', { ascending: false })
  const { data: so2ChartsPerHours, error: so2rrHours } = await supabase.from("so2Charts").select('number').eq("interval", "hour").limit(12).eq("email", email).order('created_at', { ascending: false })

  if (err || errMin || errHours || so2err || so2errMin || so2rrHours) {
    res.status(400).send({
      message: "error in data retriving "
    })
  }
  console.log(co2ChartsPerDay,
    co2ChartsPerMin,
    co2ChartsPerHours,
    so2ChartsPerDay,
    so2ChartsPerHours,
    so2ChartsPerMin)
  res.status(200).send({
    data: {
      co2ChartsPerDay,
      co2ChartsPerMin,
      co2ChartsPerHours,
      so2ChartsPerDay,
      so2ChartsPerHours,
      so2ChartsPerMin
    }
  })

})

app.patch("/updateUser", async (req, res) => {
  const { username, notificationOn } = req.body;
  console.log("object")
  const { data, error } = await supabase
    .from('users')
    .update({ username, notificationOn })
    .eq('authId', userConnected.authId)
    .select();

  if (error) {
    return res.status(400).send({ message: "Error updating user" });
  }
  res.status(200).send({ message: "User updated successfully", data });
});
app.post('/toggle', async (req, res) => {
  mqttSend = !mqttSend;
  res.status(200).send(mqttSend);
});

app.post('/deactivate', async (req, res) => {
  const { username, isActivated } = req.body;
  mqttSend = false;

  const { data, error } = await supabase
    .from('track_activation')
    .upsert({ username, isActivated }, { onConflict: ['username'] })
    .select();

  if (error) {
    return res.status(500).send(error);
  }

  res.status(200).send(data);
});


function generateRandomCO2() {
  // Generate values with higher probability in normal range
  // Generate random step within resolution limits
  const step = Math.random() * (RES * 2) - RES;

  // Calculate new value
  let newPPM = currentPPM + step;

  // Ensure value stays within bounds
  newPPM = Math.max(MIN_PPM, Math.min(MAX_PPM, newPPM));

  // Update current value
  currentPPM = newPPM;

  return Math.round(newPPM);
}
const MIN_PPM = 0;
const MAX_PPM = 10000;
const RES = 100; // Resolution step (+/- 100 ppm)
let currentPPM = 5000;

// Function to generate continuous random CO2 values
function generateRandomSO2() {
  // SO2 levels in ppm (typical ranges)
  const baseValue = 0.1; // Base SO2 level
  const variation = Math.random();

  if (variation < 0.7) {
    // 70% chance of normal range (0.1-0.5 ppm)
    return parseFloat((baseValue + Math.random() * 0.4).toFixed(3));
  } else if (variation < 0.9) {
    // 20% chance of concerning levels (0.5-2 ppm)
    return parseFloat((0.5 + Math.random() * 1.5).toFixed(3));
  } else {
    // 10% chance of dangerous levels (2-5 ppm)
    return parseFloat((2 + Math.random() * 3).toFixed(3));
  }
}


async function sendPushNotification(messages) {
  const url = "https://exp.host/--/api/v2/push/send";
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
  };

  try {
    const response = await Axios.post(url, messages, { headers });
    console.log("Push notification sent successfully:", response.data);
  } catch (error) {
    console.error("Error sending push notification:", error.response?.data || error.message);
  }
}

// MQTT publish logic
setInterval(async () => {
  let co2 = generateRandomCO2();
  let so2 = generateRandomSO2();
  if (mqttSend) {
    mqttClient.publish("zouinekh/co2", co2.toString(), (err) => {
      if (err) {
        console.error("Error publishing MQTT message:", err);
      } else {
      }
    });
    mqttClient.publish("zouinekh/so2", so2.toString(), (err) => {
      if (err) {
        console.error("Error publishing MQTT message:", err);
      } else {
      }
    });
  }

  counter += 60;
  if (counter % 60 == 0) {
    console.log("test");
    if (userConnected) {
      const { error: inserCo2err } = await supabase.from('co2Charts').insert({ number: co2, interval: "min", email: userConnected.email });
      const { error: inserSo2err } = await supabase.from('so2Charts').insert({ number: so2, interval: "min", email: userConnected.email });
      if (co2 > 4500) {

        sendPushNotification([{
          to: userConnected.pushNotificationToken,
          sound: "default",
          title: "beSafe",
          body: "WARNING CO IN YOUR HOME IS HIGH",
        }])
      }

      if (so2 > 4.8) {
        if (userConnected) {
          sendPushNotification([{
            to: userConnected.pushNotificationToken,
            sound: "default",
            title: "beSafe",
            body: "WARNING SO IN YOUR HOME IS HIGH",
          }])
        }

      }
      if (inserCo2err) {
        console.log(inserCo2err)
      }
    }
  }
  if (counter % 3600 == 0) {
    if (userConnected) {
      const { error: inserCo2err } = await supabase.from('co2Charts').insert({ number: co2, interval: "hour", email: userConnected.email });
      const { error: inserSo2err } = await supabase.from('so2Charts').insert({ number: so2, interval: "hour", email: userConnected.email });
    }
  }
  if (counter % 86400 == 0) {
    if (userConnected) {
      const { error: inserCo2err } = await supabase.from('co2Charts').insert({ number: co2, interval: "days", email: userConnected.email });
      const { error: inserSo2err } = await supabase.from('so2Charts').insert({ number: so2, interval: "days", email: userConnected.email });
    }
  }
}, 1000);

// Start the server
app.listen(3000, () => {
  console.log("Server ready on port 3000.");
});

module.exports = app;