We have a working video AI understanding project in our repo currently.

This is a hackathon project. We want to be able to recognize objects such as a can of soda or a power charger, and the user can ask the AI to buy the object. It'll reference hardcoded store object of {vendor,name,price}, the AI will confirm the sending of $PRICE PYUSD to the vendor, and when user confirms, to do the transfer.
The trigger before commands is "okay vitalik". eg: "okay vitalik, how much is that soda?"
It'll also act as bodyguard call an emergency API endpoint if user is in trouble. eg: "okay vitalik, help" and it'll call the emergency endpoint (which does nothing for now).

We want to be able to transfer PYUSD on testnet (arbitrum testnet network) and flow tokens on testnet. Make API endpoints that take the private key from .env
The list of authorized recipients should be hardcoded for now {name, walletAddress}. This is for security reasons. The name should match the store vendor name {vendor,name,price} so when we buy from vendor X it'll send to the right wallet. For confirms, it'll look up the walletAddress using ENS L2 name (see examples/L2PrimaryName.ts and examples/L2PrimaryNameOptimistic.ts). This way we can have the AI say "are you sure you want to send 5 FLOW to vendor Amazon at chinesepowered.eth"

Flow actions docs: https://github.com/onflow/flips/blob/gio/flip-338-defi-actions/application/20250730-flow-actions-defi.md
https://developers.flow.com/tutorials/defi/intro-to-flow-actions


Let me know if any questions.