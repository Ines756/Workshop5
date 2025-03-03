import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";
import axios from "axios";  // Pour envoyer des messages aux autres nœuds

export async function node(
  nodeId: number, // the ID of the node
  N: number, // total number of nodes in the network
  F: number, // number of faulty nodes in the network
  initialValue: Value, // initial value of the node
  isFaulty: boolean, // true if the node is faulty, false otherwise
  nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
  setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());
  // Variables pour suivre l'état du nœud
  let state = {
    x: initialValue, 
    k: 0, 
    decided: null as Value | null, 
    messagesReceived: 0, 
    majorityThreshold: Math.ceil((N - F) / 2), 
  };

  const receivedMessages: { [key: number]: Value } = {}; 

  const isSingleNode = () => N === 1;  

  // TODO implement this
  // this route allows retrieving the current status of the node
  // node.get("/status", (req, res) => {});
  node.get("/status", (req, res) => {
    if (isFaulty) {
      return res.status(500).send("faulty");
    }
    return res.status(200).send("live");
  });

  // TODO implement this
  // this route allows the node to receive messages from other nodes
  // node.post("/message", (req, res) => {});
  node.post("/message", (req, res) => {
    const { value, k, senderId } = req.body;
    if (state.decided === null) {
      if (isSingleNode()) {
        state.decided = value; 
        state.x = value; 
      } else {
        receivedMessages[senderId] = value;
        if (Object.keys(receivedMessages).length >= state.majorityThreshold) {
          const values = Object.values(receivedMessages);
          const counts: Record<Value, number> = {
            0: 0, 1: 0,
            "?": 0
          }; 
          values.forEach((v) => {
            counts[v] += 1; 
          });

          // Trouver la valeur majoritaire
          const majorityValue = counts[0] > counts[1] ? 0 : 1;
  
          // Appliquer la règle de Ben-Or
          if (counts[majorityValue] >= state.majorityThreshold) {
            state.decided = majorityValue;
            state.x = majorityValue;
          } else {
            // Choix aléatoire si aucune majorité claire
            state.decided = Math.random() < 0.5 ? 0 : 1;
            state.x = state.decided;
          }
        }
      }
    }
    res.sendStatus(200);
  });

  // TODO implement this
  // this route is used to start the consensus algorithm
  // node.get("/start", async (req, res) => {});
  node.get("/start", async (req, res) => {
    if (nodesAreReady()) {
      if (F > Math.floor(N / 2)) {
        return res.status(400).send("Too many faulty nodes");
      }
      if (isSingleNode()) {
        state.decided = state.x; 
      } else {
        
        for (let i = 0; i < N; i++) {
          if (i !== nodeId) {
            try {
              await axios.post(`http://localhost:${BASE_NODE_PORT + i}/message`, {
                senderId: nodeId,
                value: isFaulty ? (Math.random() < 0.5 ? 0 : 1) : state.x,
                k: state.k,
              });
            } catch (error) {
              console.error(`Error sending message to node ${i}`);
            }
          }
        }
      }
      return res.sendStatus(200);
    } else {
      return res.status(400).send("Not all nodes are ready");
    }
  });

  // TODO implement this
  // this route is used to stop the consensus algorithm
  // node.get("/stop", async (req, res) => {});
  node.get("/stop", (req, res) => {
    state = {
      x: 0,
      k: 0,
      decided: null,
      messagesReceived: 0,
      majorityThreshold: Math.ceil((N - F) / 2),
    };
    isFaulty = true;
    res.sendStatus(200);
  });

  // TODO implement this
  // get the current state of a node
  // node.get("/getState", (req, res) => {});
  // node.get("/getState", (req, res) => {});
  node.get("/getState", (req, res) => {
    if (isFaulty) {
      return res.status(500).json({
        decided: null,
        x: null,
        k: null,
        messagesReceived: 0,
        status: "faulty",
      });
    }

    return res.status(200).json({
      nodeId: nodeId,
      x: state.x,
      k: state.k,
      decided: state.decided,
      messagesReceived: Object.keys(receivedMessages).length,
      majorityThreshold: state.majorityThreshold,
      status: state.decided !== null ? "Decided" : "In progress",
    });
  });

  // Start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
      `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );
    // the node is ready
    setNodeIsReady(nodeId);
  });
  return server;
}
