# AI Agent Organization — Goal: $10k/month

A small team of AI agents that work toward **$10,000/month in revenue** using
**only free tools**. You are the **CEO** — nothing new launches without your
approval.

## The agents
- **Strategy** — proposes revenue ideas (pitches you, never acts alone)
- **Research** — validates ideas with free web search
- **Execution** — turns *approved* ideas into step-by-step plans
- **Marketing** — writes free promotion (no paid ads)
- **Finance** — tracks progress toward $10k/month

Every new initiative passes through the **CEO approval gate** before anything
happens.

## Setup (for total beginners)

### 1. Install Python
Download from https://www.python.org/downloads/ and install.
**Windows users:** tick **"Add Python to PATH"** during install.

### 2. Open a terminal
- **Windows:** Start menu → type `cmd` → Enter
- **Mac:** `Cmd+Space` → type `Terminal` → Enter

### 3. Go into this project folder
Type `cd ` (with a space) then drag the project folder into the window, press Enter.

### 4. Install the free requirements
```
pip install -r requirements.txt
```

### 5. Get your FREE Groq key (no credit card)
1. Go to https://console.groq.com and sign up
2. Create an API key
3. Set it in the terminal:
   - **Mac/Linux:** `export GROQ_API_KEY=your_key_here`
   - **Windows:** `set GROQ_API_KEY=your_key_here`

### 6. Run it
```
python main.py
```

You'll see your CEO dashboard. Start with option **1** to have the team pitch
you an idea.

## Cost
**$0.** Groq's free tier runs the agents, DuckDuckGo powers free web search,
and everything is saved locally in `data/state.json`. No paid API key anywhere.
