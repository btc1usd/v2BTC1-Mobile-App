import { keccak256 } from 'ethers';
import { solidityPackedKeccak256 } from 'ethers';

export interface MerkleDistributionClaim {
  index: number;
  account: string;
  amount: string;
  proof: string[];
}

export interface MerkleTreeData {
  merkleRoot: string;
  claims: { [account: string]: MerkleDistributionClaim };
}

/**
 * Merkle Tree implementation for token distributions
 * Based on Uniswap's merkle distributor pattern
 */
export class MerkleTree {
  private elements: Buffer[];
  private layers: Buffer[][];

  constructor(elements: Buffer[]) {
    this.elements = [...elements];
    // Sort elements for deterministic trees
    this.elements.sort(Buffer.compare);

    // Deduplicate elements
    this.elements = this.bufDedup(this.elements);

    // Create layers
    this.layers = this.getLayers(this.elements);
  }

  private bufDedup(elements: Buffer[]): Buffer[] {
    return elements.filter((el, idx) => {
      return idx === 0 || !elements[idx - 1].equals(el);
    });
  }

  private getLayers(elements: Buffer[]): Buffer[][] {
    if (elements.length === 0) {
      throw new Error('empty tree');
    }

    const layers = [];
    layers.push(elements);

    // Get next layer until we reach the root
    while (layers[layers.length - 1].length > 1) {
      layers.push(this.getNextLayer(layers[layers.length - 1]));
    }

    return layers;
  }

  private getNextLayer(elements: Buffer[]): Buffer[] {
    return elements.reduce<Buffer[]>((layer, el, idx, arr) => {
      if (idx % 2 === 0) {
        // Hash the current element with the next one
        layer.push(this.combinedHash(el, arr[idx + 1]));
      }

      return layer;
    }, []);
  }

  private combinedHash(first: Buffer, second?: Buffer): Buffer {
    if (!second) {
      return first;
    }

    return Buffer.from(
      keccak256(
        Buffer.concat([first, second].sort(Buffer.compare))
      ).slice(2),
      'hex'
    );
  }

  getRoot(): Buffer {
    return this.layers[this.layers.length - 1][0];
  }

  getHexRoot(): string {
    return '0x' + this.getRoot().toString('hex');
  }

  getProof(el: Buffer): Buffer[] {
    let idx = this.bufIndexOf(el, this.elements);

    if (idx === -1) {
      throw new Error('Element does not exist in Merkle tree');
    }

    return this.layers.reduce((proof, layer) => {
      const pairElement = this.getPairElement(idx, layer);

      if (pairElement) {
        proof.push(pairElement);
      }

      idx = Math.floor(idx / 2);

      return proof;
    }, []);
  }

  getHexProof(el: Buffer): string[] {
    const proof = this.getProof(el);
    return proof.map((x) => '0x' + x.toString('hex'));
  }

  private getPairElement(idx: number, layer: Buffer[]): Buffer | null {
    const pairIdx = idx % 2 === 0 ? idx + 1 : idx - 1;

    if (pairIdx < layer.length) {
      return layer[pairIdx];
    } else {
      return null;
    }
  }

  private bufIndexOf(el: Buffer, arr: Buffer[]): number {
    let hash;

    // Convert element to 32-byte hash if it isn't one already
    if (el.length !== 32 || !Buffer.isBuffer(el)) {
      hash = Buffer.from(keccak256(el).slice(2), 'hex');
    } else {
      hash = el;
    }

    for (let i = 0; i < arr.length; i++) {
      if (hash.equals(arr[i])) {
        return i;
      }
    }

    return -1;
  }

  static verify(proof: string[], root: string, leaf: string): boolean {
    let computedHash = leaf;

    for (const proofElement of proof) {
      if (computedHash <= proofElement) {
        // Hash(current computed hash + current element of the proof)
        computedHash = keccak256(computedHash + proofElement.slice(2));
      } else {
        // Hash(current element of the proof + current computed hash)
        computedHash = keccak256(proofElement + computedHash.slice(2));
      }
    }

    // Check if the computed hash (root) is equal to the provided root
    return computedHash === root;
  }
}

/**
 * Generate merkle tree and claims for token distribution
 * @param claims Array of {account, amount} objects
 * @returns MerkleTreeData with root and formatted claims
 */
export function generateMerkleTree(
  claims: Array<{ account: string; amount: string }>
): MerkleTreeData {
  // Create merkle tree elements
  const elements = claims.map((claim, index) => {
    return Buffer.from(
      solidityPackedKeccak256(
        ['uint256', 'address', 'uint256'],
        [index, claim.account, claim.amount]
      ).slice(2),
      'hex'
    );
  });

  const merkleTree = new MerkleTree(elements);
  const merkleRoot = merkleTree.getHexRoot();

  // Generate claims with proofs
  const formattedClaims: { [account: string]: MerkleDistributionClaim } = {};

  claims.forEach((claim, index) => {
    const element = Buffer.from(
      solidityPackedKeccak256(
        ['uint256', 'address', 'uint256'],
        [index, claim.account, claim.amount]
      ).slice(2),
      'hex'
    );

    const proof = merkleTree.getHexProof(element);

    formattedClaims[claim.account] = {
      index,
      account: claim.account,
      amount: claim.amount,
      proof,
    };
  });

  return {
    merkleRoot,
    claims: formattedClaims,
  };
}

/**
 * Parse a balance map to generate merkle tree
 * @param balances Object mapping addresses to amounts
 * @returns MerkleTreeData
 */
export function parseBalanceMap(balances: { [account: string]: string }): MerkleTreeData {
  const claims = Object.keys(balances)
    .sort()
    .map((account) => ({
      account,
      amount: balances[account],
    }));

  return generateMerkleTree(claims);
}

/**
 * Validate a merkle proof
 * @param index Claim index
 * @param account Account address
 * @param amount Claim amount
 * @param proof Merkle proof
 * @param root Merkle root
 * @returns Whether the proof is valid
 */
export function validateMerkleProof(
  index: number,
  account: string,
  amount: string,
  proof: string[],
  root: string
): boolean {
  const leaf = solidityPackedKeccak256(
    ['uint256', 'address', 'uint256'],
    [index, account, amount]
  );

  return MerkleTree.verify(proof, root, leaf);
}

/**
 * Generate distribution data for weekly rewards
 * @param holderBalances Mapping of holder addresses to their BTC1USD balances
 * @param rewardPerToken Reward amount per token (in wei)
 * @returns MerkleTreeData for the distribution
 */
export function generateWeeklyDistribution(
  holderBalances: { [address: string]: string },
  rewardPerToken: string
): MerkleTreeData {
  const claims: Array<{ account: string; amount: string }> = [];

  // Calculate rewards for each holder
  Object.entries(holderBalances).forEach(([address, balance]) => {
    const balanceWei = BigInt(balance);
    const rewardWei = BigInt(rewardPerToken);
    const reward = (balanceWei * rewardWei) / BigInt(10 ** 18); // Assuming rewardPerToken is in wei
    
    if (reward > 0n) {
      claims.push({
        account: address,
        amount: reward.toString(),
      });
    }
  });

  return generateMerkleTree(claims);
}

/**
 * Load distribution data from a JSON file (for scripts)
 */
export function loadDistributionFromFile(filePath: string): MerkleTreeData {
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return data;
}

/**
 * Save distribution data to a JSON file (for scripts)
 */
export function saveDistributionToFile(distribution: MerkleTreeData, filePath: string): void {
  const fs = require('fs');
  fs.writeFileSync(filePath, JSON.stringify(distribution, null, 2));
}