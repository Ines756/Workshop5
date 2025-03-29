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

  type NodeState = {
    killed: boolean;
    x: 0 | 1 | "?" | null;
    decided: boolean | null;
    k: number | null;
  };

  const nodeState: NodeState = {
    killed: false,
    x: isFaulty ? null : initialValue,
    decided: isFaulty ? null : false,
    k: isFaulty ? null : 0,
  };

  // Variables pour suivre l'état du nœud
  let state = {
    x: initialValue, 
    k: 0, 
    decided: null as Value | null, 
    messagesReceived: 0, 
    majorityThreshold: Math.ceil((N - F) / 2), 
  };

  const receivedMessages: { [step: number]: Value[] } = {};


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
    const { k, x, messageType } = req.body;
    
    if (isFaulty) {
      nodeState.x = null;
      nodeState.decided = null;
      nodeState.k = null;
      return res.status(500).send("faulty");
    }
  
    if (nodeState.killed) {
      return res.status(500).send("killed");
    }
  
    if (messageType === "decision") {
      if (!receivedMessages[k]) receivedMessages[k] = [];
      receivedMessages[k].push(x);
  
      if (receivedMessages[k].length >= N - F) {
        const count0 = receivedMessages[k].filter(v => v === 0).length;
        const count1 = receivedMessages[k].filter(v => v === 1).length;
        
        const decidedValue = count0 > N / 2 ? 0 : count1 > N / 2 ? 1 : "?";
  
        for (let i = 0; i < N; i++) {
          fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ k, x: decidedValue, messageType: "final" }),
          });
        }
      }
    } 
    else if (messageType === "final") {
      if (!receivedMessages[k]) receivedMessages[k] = [];
      receivedMessages[k].push(x);
    
      const finals = receivedMessages[k];
      const count0 = finals.filter(v => v === 0).length;
      const count1 = finals.filter(v => v === 1).length;
    
      if ((count0 >= F + 1 || count1 >= F + 1) && (finals.length >= N - F)) {
        nodeState.x = count1 >= F + 1 ? 1 : 0;
        nodeState.decided = true;
        console.log(`Node ${nodeId} decides definitively : ${nodeState.x}`);
      } else {
        nodeState.x = (count1 + count0) > 0 ? (count1 >= count0 ? 1 : 0) : (Math.random() < 0.5 ? 0 : 1);
        if (nodeState.k !== null) {
          nodeState.k = nodeState.k + 1;
        
          if (nodeState.k <= 10) {
            for (let i = 0; i < N; i++) {
              fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ k: nodeState.k, x: nodeState.x, messageType: "decision" }),
              });
            }
          }
        }
        
      }
    }
    
  
    return res.status(200).send("received");
  });
  

  // TODO implement this
  // this route is used to start the consensus algorithm
  // node.get("/start", async (req, res) => {});
  node.get("/start", async (req, res) => {
    if (isFaulty) {
      nodeState.x = null;
      nodeState.decided = null;
      nodeState.k = null;
      return res.status(500).send("faulty node");
    }
    while (!nodesAreReady()) await new Promise((r) => setTimeout(r, 50));
    nodeState.k = 1;
    nodeState.decided = false;
    nodeState.x = initialValue;
  
    for (let i = 0; i < N; i++) {
      fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k: nodeState.k, x: nodeState.x, messageType: "decision" }),
      });
    }
    return res.status(200).send("Starting.");
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

  node.get("/getState", (req, res) => {
    return res.status(200).json(nodeState);
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
