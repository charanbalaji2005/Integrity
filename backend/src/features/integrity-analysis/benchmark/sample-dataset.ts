import type { BenchmarkSample } from "./benchmark-types";

export const BENCHMARK_DATASET: BenchmarkSample[] = [
	// 3 Human essays
	{
		id: "h1",
		source: "Human",
		expectedLabel: "Human",
		text: "I think that technology has really changed how we interact with our friends and families. Sometimes it feels like we are always on our phones, but other times it makes it so easy to stay in touch when we live far away. Honestly, my parents always complain about it, but then I see them checking Facebook every five minutes anyway. It's just a part of life now, you know? We can't really escape it, but we can try to be more mindful about when we use it.",
		notes: "Casual personal reflection on technology.",
	},
	{
		id: "h2",
		source: "Human",
		expectedLabel: "Human",
		text: "During my summer vacation, I went to the Grand Canyon with my family. The view was absolutely amazing and the weather was super hot, like over 100 degrees! We hiked down a little bit, but my little brother got tired really quickly, so we had to turn back and go get ice cream instead. It was still a great trip and I got some cool photos for my Instagram. I'd love to go back when I'm older and do a longer hike all the way to the bottom.",
		notes: "Travel essay with typical human formatting and casual tone.",
	},
	{
		id: "h3",
		source: "Human",
		expectedLabel: "Human",
		text: "Reading books is still important, even with all the videos and games we have today. When you read, you have to use your imagination to picture what the characters and places look like. It's different from watching a movie where everything is already decided for you. Plus, it helps with your spelling and vocabulary without you even realizing it. I try to read for at least fifteen minutes before I go to sleep.",
		notes: "Short opinion essay.",
	},

	// 3 ChatGPT responses
	{
		id: "cg1",
		source: "ChatGPT",
		expectedLabel: "AI",
		text: "Furthermore, the role of modern technology in facilitating global communication cannot be overstated. It is important to note that digital platforms have bridged geographic divides, allowing instantaneous connectivity. Consequently, individuals are able to maintain relationships across continents. Overall, while challenges regarding screen time persist, the primary impact remains highly transformative and beneficial.",
		notes: "ChatGPT style with high connectors and passive voice.",
	},
	{
		id: "cg2",
		source: "ChatGPT",
		expectedLabel: "AI",
		text: "In conclusion, the preservation of biodiversity is crucial for the health of our planet. This highlights the delicate balance of ecosystems. Moreover, human activities have significantly contributed to habitat destruction, which threatens numerous species. It can therefore be concluded that immediate conservation efforts are paramount to secure a sustainable future.",
		notes: "ChatGPT style with high connectors.",
	},
	{
		id: "cg3",
		source: "ChatGPT",
		expectedLabel: "AI",
		text: "The study of historical precedents is essential to understanding contemporary political structures. Additionally, analyzing past conflicts offers vital insights into diplomatic strategies. It is important to note that lessons from history are profound and serve as a guide for future policy making. Hence, a thorough historical education is indispensable.",
		notes: "ChatGPT style.",
	},

	// 2 Gemini responses
	{
		id: "gem1",
		source: "Gemini",
		expectedLabel: "AI",
		text: "Here is a breakdown of why environmental sustainability matters. First, ecosystems provide vital services like clean water and pollination. Second, climate change poses a significant threat to global economies. Consequently, transitioning to renewable energy is not just an option, but a necessity. This highlights the urgency of global cooperation.",
		notes: "Gemini structured list style.",
	},
	{
		id: "gem2",
		source: "Gemini",
		expectedLabel: "AI",
		text: "Understanding quantum computing requires looking at key principles of physics. Superposition allows qubits to exist in multiple states. Moreover, entanglement links qubits across distance. Overall, these concepts enable unprecedented processing power. It is important to note that commercial applications are still developing.",
		notes: "Gemini academic breakdown.",
	},

	// 2 Claude responses
	{
		id: "cl1",
		source: "Claude",
		expectedLabel: "AI",
		text: "To address the question of economic inflation, we must consider several factors. Central bank policies play a pivotal role in controlling currency supply. Furthermore, supply chain disruptions can drive up prices rapidly. In conclusion, balancing interest rates is a delicate task that requires constant adjustment to maintain economic stability.",
		notes: "Claude analytical style.",
	},
	{
		id: "cl2",
		source: "Claude",
		expectedLabel: "AI",
		text: "The ethical implications of artificial intelligence are profound. As algorithms make decisions in healthcare and finance, transparency becomes crucial. Moreover, bias in training data must be actively mitigated. Overall, creating ethical frameworks is vital to ensure AI benefits society as a whole.",
		notes: "Claude reflective ethical discussion.",
	},

	// 2 DeepSeek responses
	{
		id: "ds1",
		source: "DeepSeek",
		expectedLabel: "AI",
		text: "First, let's analyze the structural integrity of the bridge. The load-bearing columns must support vertical forces. Additionally, the cables distribute tension across the span. Overall, this design minimizes structural fatigue. It is important to note that regular maintenance is essential to prevent failure.",
		notes: "DeepSeek technical analysis.",
	},
	{
		id: "ds2",
		source: "DeepSeek",
		expectedLabel: "AI",
		text: "The main benefit of a decentralized database is data redundancy. Because nodes share records, data loss is prevented. Furthermore, cryptographic security secures transactions. In conclusion, blockchain offers a robust alternative to centralized databases.",
		notes: "DeepSeek technical analysis.",
	},

	// 2 Llama responses
	{
		id: "ll1",
		source: "Llama",
		expectedLabel: "AI",
		text: "Here's a response on agricultural practices. Organic farming methods reduce chemical runoff into water sources. Moreover, crop rotation preserves soil nutrients naturally. Overall, sustainable farming is crucial for long-term food security. It can therefore be concluded that policy incentives should favor green agriculture.",
		notes: "Llama response format.",
	},
	{
		id: "ll2",
		source: "Llama",
		expectedLabel: "AI",
		text: "Let's explore how neural networks learn. Weight optimization is conducted using backpropagation. Furthermore, activation functions introduce non-linearity. This highlights the complex mathematics behind machine learning models. Hence, deep learning requires substantial computing power.",
		notes: "Llama technical response.",
	},

	// 3 Paraphrased AI samples
	{
		id: "pa1",
		source: "Paraphrased AI",
		expectedLabel: "AI",
		text: "Additionally, modern technology's part in aiding global communication can't be downplayed. It's key to remember that online tools have closed geographical gaps, enabling instant chats. As a result, people can keep up relationships across the world. Overall, even though screen time is a concern, the main effect is highly positive.",
		notes: "Paraphrased version of cg1, retaining core AI structures.",
	},
	{
		id: "pa2",
		source: "Paraphrased AI",
		expectedLabel: "AI",
		text: "To sum up, keeping biodiversity safe is vital for our world's health. This points out the fragile state of wildlife. What's more, human activities have heavily caused habitat loss, hurting many species. It can be decided that fast action is key for a good future.",
		notes: "Paraphrased version of cg2, keeping some connector flow.",
	},
	{
		id: "pa3",
		source: "Paraphrased AI",
		expectedLabel: "AI",
		text: "Looking at past events is crucial to get today's political setups. Also, studying old wars gives helpful tips on statecraft. It's important to see that history's lessons are deep and help make future rules. So, a good history class is vital.",
		notes: "Paraphrased version of cg3.",
	},
];
