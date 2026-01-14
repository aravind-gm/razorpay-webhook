import { PrismaClient } from '@prisma/client';
import { slugify } from '../src/utils/helpers';
import { hashPassword } from '../src/utils/password';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create Admin User
  console.log('Creating admin user...');
  const adminPassword = await hashPassword('admin123');
  
  await prisma.user.upsert({
    where: { email: 'admin@orashop.in' },
    update: {},
    create: {
      email: 'admin@orashop.in',
      passwordHash: adminPassword,
      fullName: 'Admin User',
      phone: '9876543210',
      role: 'ADMIN',
      isVerified: true,
    },
  });

  console.log('✅ Admin user created');

  // Create Categories
  console.log('Creating categories...');
  
  const categories = [
    { name: 'Necklaces', description: 'Elegant necklaces for every occasion' },
    { name: 'Earrings', description: 'Beautiful earrings to complement your style' },
    { name: 'Bracelets', description: 'Graceful bracelets and bangles' },
    { name: 'Rings', description: 'Stunning rings for your fingers' },
    { name: 'Jewellery Sets', description: 'Complete matching jewellery sets' },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: slugify(cat.name) },
      update: {},
      create: {
        name: cat.name,
        slug: slugify(cat.name),
        description: cat.description,
        isActive: true,
      },
    });
  }

  console.log('✅ Categories created');

  // Get created categories
  const necklacesCat = await prisma.category.findUnique({
    where: { slug: 'necklaces' },
  });
  
  const earringsCat = await prisma.category.findUnique({
    where: { slug: 'earrings' },
  });

  // Create Sample Products
  console.log('Creating sample products...');

  const products = [
    {
      name: 'Rose Gold Pendant Necklace',
      description: 'Elegant rose gold plated pendant necklace with delicate chain. Perfect for daily wear or special occasions.',
      shortDescription: 'Rose gold plated pendant with chain',
      price: 2499,
      discountPercent: 10,
      categoryId: necklacesCat?.id,
      material: 'Rose Gold Plated Brass',
      careInstructions: 'Keep away from water and perfume. Store in a dry place.',
      stockQuantity: 50,
      isFeatured: true,
    },
    {
      name: 'Pearl Drop Earrings',
      description: 'Classic pearl drop earrings with gold plated hooks. Timeless elegance for any outfit.',
      shortDescription: 'Pearl drop earrings with gold hooks',
      price: 1899,
      discountPercent: 15,
      categoryId: earringsCat?.id,
      material: 'Artificial Pearl, Gold Plated',
      careInstructions: 'Handle with care. Avoid contact with chemicals.',
      stockQuantity: 75,
      isFeatured: true,
    },
    {
      name: 'Crystal Statement Necklace',
      description: 'Bold crystal statement necklace that adds sparkle to any outfit. Perfect for parties and celebrations.',
      shortDescription: 'Crystal statement necklace',
      price: 3299,
      discountPercent: 20,
      categoryId: necklacesCat?.id,
      material: 'Crystal, Brass Base',
      careInstructions: 'Wipe with soft cloth. Store separately to avoid scratches.',
      stockQuantity: 30,
      isFeatured: true,
    },
    {
      name: 'Gold Hoop Earrings',
      description: 'Minimalist gold plated hoop earrings. Versatile design for everyday elegance.',
      shortDescription: 'Gold plated hoop earrings',
      price: 999,
      discountPercent: 0,
      categoryId: earringsCat?.id,
      material: 'Gold Plated Brass',
      careInstructions: 'Clean with dry cloth. Avoid moisture.',
      stockQuantity: 100,
      isFeatured: false,
    },
    {
      name: 'Test Payment Item - ₹1',
      description: '⚠️ TEST ITEM ONLY - For Razorpay payment gateway testing. This is a special test product priced at ₹1 to facilitate payment testing without real charges. Use this item to test the complete checkout flow including cart, payment gateway integration, and order confirmation.',
      shortDescription: 'Test item for payment gateway testing - ₹1',
      price: 1,
      discountPercent: 0,
      categoryId: earringsCat?.id,
      material: 'Test Material',
      careInstructions: 'This is a test product for payment testing purposes only.',
      stockQuantity: 9999,
      isFeatured: true,
    },
  ];

  for (const product of products) {
    const finalPrice = product.price - (product.price * product.discountPercent) / 100;
    const { categoryId, ...productData } = product;
    
    const dataToCreate: any = {
      ...productData,
      finalPrice,
      slug: slugify(product.name),
      sku: `ORA-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`,
      metaTitle: product.name,
      metaDescription: product.shortDescription,
    };
    
    if (categoryId) {
      dataToCreate.category = {
        connect: { id: categoryId }
      };
    }
    
    await prisma.product.create({
      data: dataToCreate,
    });
  }

  console.log('✅ Sample products created');

  // Create Demo Customer
  console.log('Creating demo customer...');
  const customerPassword = await hashPassword('customer123');
  
  await prisma.user.upsert({
    where: { email: 'customer@demo.com' },
    update: {},
    create: {
      email: 'customer@demo.com',
      passwordHash: customerPassword,
      fullName: 'Demo Customer',
      phone: '9876543211',
      role: 'CUSTOMER',
      isVerified: true,
    },
  });

  console.log('✅ Demo customer created');

  console.log('\n🎉 Seeding completed successfully!\n');
  console.log('📝 Credentials:');
  console.log('   Admin: admin@orashop.in / admin123');
  console.log('   Customer: customer@demo.com / customer123');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
